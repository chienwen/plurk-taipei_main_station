const tsNow = (new Date()).getTime();
const ptx = require('./lib/ptx');
//const logError = require('./lib/logError');

const SETTINGS = {
    PLURK_MAX_CHARS: 360,
    TRA_STATION_ID: 1000, // Taipei Main Station
};

const emojiDict = {
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
        callAPI: (url, param, cb) => {
            cb(null, {
                plurk_id: 'DEBUG',
                qualifier_translated: param.qualifier,
                content: param.content
            });
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

function postPlurkWithTime(annocements, qualifier) {
    if (annocements.length == 0) {
        return;
    }
    let str = '';
    const toPlurkStrings = [];
    while(annocements.length > 0) {
        let nextAnnocement = annocements.pop();
        if (str.length + nextAnnocement.length + 1 <= SETTINGS.PLURK_MAX_CHARS) {
            str += nextAnnocement + "\n";
        } else {
            toPlurkStrings.push(str);
            str = '';
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

const taskRouter = {
    all: function() {
        Object.keys(this).filter(task => task !== 'all').forEach((task) => {
            console.log('Invoke task', task);
            taskRouter[task]();
        });
    },
    tra: function() {
        ptx.getLiveStatusTRA(SETTINGS.TRA_STATION_ID, (data) => {
            const trains = data.StationLiveBoards;
            const timeTablePromises = [];
            trains.forEach((train) => {
                timeTablePromises.push(new Promise((resolve, reject) => {
                    ptx.getTimeTableTRA(train.TrainNo, (timeTable) => {
                        resolve(timeTable);
                    })
                }));
            });
            Promise.all(timeTablePromises).then((timeTables) => {
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
                const traStatusMapping = ['準點', '誤點', '取消'];
                const traTripLineMapping = ['不經山海線', '山線', '海線', '成追線'];
                const annocements = trains.map((train) => {
                    let words = [train.ScheduleDepartureTime.substr(0,5), emojiDict.train, train.TrainNo, '次', train.TrainTypeName.Zh_tw];
                    if (train.TripLine) {
                        words.push(traTripLineMapping[train.TripLine]);
                    }
                    words = words.concat([train.Direction ? emojiDict.down : emojiDict.up, '開往', train.EndingStationName.Zh_tw]);
                    words.push(emojiDict.statusLights[train.RunningStatus] + '**' + traStatusMapping[train.RunningStatus] + '**')
                    if (train.DelayTime) {
                        words.push(`慢${train.DelayTime}分`);
                    }
                    if (train.StopTimes && train.StopTimes.length > 0) {
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
                    return words.join(' ');
                });
                console.log(annocements);
                postPlurkWithTime(annocements, 'wishes');
            });
        });
    },
    thsr: function() {
    },
    clean: function() {
        plurk.callAPI('/APP/Timeline/getPlurks', {
            offset: (new Date(tsNow - 86400000)).toISOString().split('.')[0]
        }, (err, data) => {
            if (err) {
                console.log('ERROR', err);
            } else {
                if (data.plurks) {
                    data.plurks.forEach((pl) => {
                        const id = pl.plurk_id;
                        if (IS_DEBUG) {
                            console.log('DEBUG', 'will delete plurk id', id);
                        } else {
                            plurk.callAPI('/APP/Timeline/plurkDelete', {
                                plurk_id: id
                            }, (err, data) => {
                                console.log("ok, deleted", id, data);
                            });
                        }
                    });
                }
                else {
                    console.log('Nothing to delete');
                }
            }
        });
    },
};

if (process.argv.length < 3 || (!taskRouter[process.argv[2]])) {
    console.error('Usage:', process.argv[0], process.argv[1], Object.keys(taskRouter).join('|'), '[debug]');
    return -1;
}

taskRouter[process.argv[2]]();
