const tsNow = (new Date()).getTime();
const ptx = require('./lib/ptx');
const util = require('util');
const dedupPost = require('./lib/dedupPost');
//const logError = require('./lib/logError');

const SETTINGS = {
    PLURK_MAX_CHARS: 360,
    TRA_STATION_ID: 1000, // Taipei Main Station
    THSR_WATCH_WINDOW_MINUTES: 30,
};

const emojiDict = {
    anticlockwise: '🔄',
    clockwise: '🔁',
    'new': '🆕',
    hsTrain: '🚄',
    train: '🚆',
    up: '⬆️',
    down: '⬇️',
    station: '🚉',
    statusLights: [
        '🟢',
        '🟡',
        '🔴',
    ]
};

let plurk = require('./lib/plurk');
const IS_DEBUG = process.argv.length === 4 && process.argv[3] === 'debug';
if (IS_DEBUG) {
    plurk = {
        realPlurk: plurk,
        callAPI: function(url, param, cb) {
            if (url === '/APP/Timeline/getPlurks') {
                this.realPlurk.callAPI(url, param, cb);
            } else {
                console.log("Mocked plurk is used");
                cb(null, {
                    plurk_id: 'DEBUG',
                    qualifier_translated: param.qualifier,
                    content: param.content
                });
            }
        }
    };
}

function postPlurk(content, qualifier) {
    return new Promise((resolve, reject) => {
            plurk.callAPI('/APP/Timeline/plurkAdd', {
            content,
            qualifier: qualifier || 'says',
            lang: 'tr_ch',
        }, (err, data) => {
            if (err) {
                console.log('ERROR', err);
                reject(err);
            } else {
                console.log('======== OK', data.plurk_id, data.qualifier_translated, data.content);
                resolve(data);
            }
        });
    });
}

function postPlurkWithTime(annocements, qualifier, header) {
    if (annocements.length == 0) {
        return;
    }
    const getHeader = () => {
        if (header) {
            return header + "\n";
        } else {
            return '';
        }
    };
    let str = getHeader();
    const toPlurkStrings = [];
    while(annocements.length > 0) {
        let nextAnnocement = annocements.pop();
        if (str.length + nextAnnocement.length + 1 <= SETTINGS.PLURK_MAX_CHARS) {
            str += nextAnnocement + "\n";
        } else {
            toPlurkStrings.push(str);
            str = getHeader();
        }
    }
    if (str) {
        toPlurkStrings.push(str);
    }
    toPlurkStrings.forEach((str) => {
        postPlurk(str, qualifier);
    });
}

function twoDigits(n) {
    if (n < 10) {
        return '0' + n;
    } else {
        return '' + n;
    }
}

function timeToDisplay(hour, minute) {
    return twoDigits(hour) + ':' + twoDigits(minute);
}

function getTsFromCST(hh_mm) {
    const t = new Date(tsNow + 3600000 * 8);
    // YYYY-MM-DDThh:mm:ss[.mmm]TZD
    return (new Date(t.getUTCFullYear() + '-' + twoDigits(t.getUTCMonth() + 1) + '-' + twoDigits(t.getUTCDate()) + 'T' + hh_mm + ':00+08:00')).getTime();
}

function postPlurkRailwayNews(newsItems, header) {
    dedupPost.init();
    newsItems.forEach((newsItem) => {
        let content = header + "\n";
        if (newsItem.url) {
            content += newsItem.url + ' (' + newsItem.title.replace(/\(/g, '（').replace(/\)/g, '）') + ')';
        } else {
            content += newsItem.title + "\n" + newsItem.description;
        }
        if (content.length > SETTINGS.PLURK_MAX_CHARS) {
            content = content.substr(0, SETTINGS.PLURK_MAX_CHARS - 3) + '...';
        }
        if (!dedupPost.wasPosted(content)) {
            dedupPost.add(content);
            postPlurk(content, 'shares');
        }
    });
    dedupPost.finish();
}

const taskRouter = {
    all: function() {
        Object.keys(this).filter(task => task !== 'all').forEach((task) => {
            console.log('Invoke task', task);
            taskRouter[task]();
        });
    },
    tra: function() {
        ptx.getLiveStatusTRA(SETTINGS.TRA_STATION_ID, (data) => {
            const trains = data.StationLiveBoards.filter((train) => {
                if (SETTINGS.TRA_STATION_ID == '1000' && train.EndingStationID == '1001') { // 台北站環島線特殊情況
                    let t = new Date(tsNow + 3600000 * 8);
                    return t.getUTCHours() < 12;
                } else {
                    return train.EndingStationID != SETTINGS.TRA_STATION_ID;
                }
            });
            ptx.getTimeTablesTRA((timeTables) => {
                // Inject StopTimes
                timeTables.forEach((timeTable) => {
                    for (let i = 0; i < trains.length; i++) {
                        let train = trains[i];
                        if (train.TrainNo === timeTable.TrainInfo.TrainNo) {
                            train.StopTimes = timeTable.StopTimes;
                            break;
                        }
                    }
                });
                // Generate annocements
                trains.sort((a, b) => {
                    return b.ScheduleDepartureTime.localeCompare(a.ScheduleDepartureTime)
                });
                //console.log(util.inspect(trains, {showHidden: false, depth: null}))

                const traStatusMapping = ['準點', '誤點', '取消'];
                const traTripLineMapping = ['不經山海線', '山線', '海線', '成追線'];
                const annocementsTypes = [[], []];
                trains.forEach((train) => {
                    let words = [emojiDict.statusLights[train.RunningStatus], train.ScheduleDepartureTime.substr(0,5), traStatusMapping[train.RunningStatus] + (train.DelayTime ? `${train.DelayTime}分` : '')];
                    words = words.concat([train.TrainNo + '次', train.TrainTypeName.Zh_tw]);
                    if (train.TripLine) {
                        words.push(traTripLineMapping[train.TripLine]);
                    }
                    words = words.concat(['開往', train.EndingStationName.Zh_tw]);
                    if (train.StopTimes && train.StopTimes.length > 1) {
                        words.push('沿途停靠');
                        let skip = true;
                        const viaStationNames = [];
                        train.StopTimes.forEach((station) => {
                            if (skip) {
                                if (station.StationID == SETTINGS.TRA_STATION_ID) {
                                    skip = false;
                                }
                            } else {
                                viaStationNames.push(station.StationName.Zh_tw);
                            }
                        });
                        words.push(viaStationNames.join('→'));
                    }
                    annocementsTypes[train.Direction].push(words.join(' '));
                });
                for (let i = 0; i < annocementsTypes.length; i++) {
                    postPlurkWithTime(annocementsTypes[i], 'wishes', [emojiDict.train + '臺鐵', (i ? emojiDict.anticlockwise : emojiDict.clockwise) + (i ? '逆行' : '順行'), '即將出發'].join(' '));
                }
            });
        });
        ptx.getNewsTRA((newsItems) => {
            postPlurkRailwayNews(newsItems, emojiDict.train + " 臺鐵新聞");
        });
    },
    thsr: function() {
        ptx.getLiveStatusTHSR(SETTINGS.TRA_STATION_ID, (data) => {
            const trains = data.AvailableSeats.filter((train) => {
                const diff = getTsFromCST(train.DepartureTime) - tsNow;
                return diff >= 0 && diff < 60000 * SETTINGS.THSR_WATCH_WINDOW_MINUTES;
            });
            trains.sort((a, b) => {
                return b.DepartureTime.localeCompare(a.DepartureTime)
            });
            const annocementsTypes = [[], []];
            trains.forEach((train) => {
                let words = [train.DepartureTime, '車次', train.TrainNo, '開往', train.EndingStationName.Zh_tw];
                if (train.StopStations && train.StopStations.length > 1) {
                    words.push('沿途停靠');
                    words.push(train.StopStations.map((station) => {
                        return station.StationName.Zh_tw;
                    }).join('→'));
                }
                annocementsTypes[train.Direction].push(words.join(' '));
            });
            for (let i = 0; i < annocementsTypes.length; i++) {
                postPlurkWithTime(annocementsTypes[i], 'wishes', [emojiDict.hsTrain + '高鐵', (i ? emojiDict.up : emojiDict.down) + (i ? '北上' : '南下'), '即將出發'].join(' '));
            }
        });
        ptx.getNewsTHSR((newsItems) => {
            postPlurkRailwayNews(newsItems, emojiDict.hsTrain + " 高鐵新聞");
        });
    },
    clean: function() {
        const allPlurks = [];
        async function getAndDeleteAllplurks() {
            function getPlurks(tsOlderThan) {
                return new Promise((resolve, reject) => {
                    plurk.callAPI('/APP/Timeline/getPlurks', {
                        offset: (new Date(tsOlderThan)).toISOString().split('.')[0],
                        limit: 30, // max is actually 30
                    }, (err, data) => {
                        if (!err) {
                            resolve(data);
                        }
                    });
                });
            }
            function deletePlurkPromise(plurk_id) {
                return new Promise((resolve, reject) => {
                    if (IS_DEBUG) {
                        console.log('DEBUG', 'will delete plurk id', plurk_id);
                        resolve();
                    } else {
                        plurk.callAPI('/APP/Timeline/plurkDelete', {
                            plurk_id
                        }, (err, data) => {
                            console.log("ok, deleted", plurk_id, data);
                            resolve();
                        });
                    }
                });
            }
            let tsOlderThan = tsNow - 86400000;
            let plurksToDelete = [];
            while (true) {
                console.log('fetch older than', (new Date(tsOlderThan)).toISOString());
                let data = await getPlurks(tsOlderThan);
                if (data.plurks.length > 0) {
                    data.plurks.forEach((plurk) => {
                        tsOlderThan = Math.min(tsOlderThan, (new Date(plurk.posted)).getTime());
                    });
                    plurksToDelete = plurksToDelete.concat(data.plurks);
                } else {
                    break;
                }
            }
            if (plurksToDelete.length > 0) {
                console.log('fetched', plurksToDelete.length, 'plurks to delete');
                const toDeletePlurkPromises = [];
                plurksToDelete.forEach((plurk) => {
                    toDeletePlurkPromises.push(deletePlurkPromise(plurk.plurk_id));
                });
                Promise.all(toDeletePlurkPromises).then(() => {
                    console.log('All deleted');
                });
            } else {
                console.log('Nothing to delete');
            }
        }
        getAndDeleteAllplurks();
    },
};

if (process.argv.length < 3 || (!taskRouter[process.argv[2]])) {
    console.error('Usage:', process.argv[0], process.argv[1], Object.keys(taskRouter).join('|'), '[debug]');
    return -1;
}

taskRouter[process.argv[2]]();
