const tsMsNow = (new Date()).getTime();
const axios = require('axios');
const qs = require('qs');
const fs = require('fs');
const config = require('./config');
const TW_MOTC_TDX_APP_ID = config('TW_MOTC_TDX_APP_ID');
const TW_MOTC_TDX_APP_KEY = config('TW_MOTC_TDX_APP_KEY');
const API_BASE_URL = 'https://tdx.transportdata.tw/api/basic/';
const API_TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
                            
const accessToken = {
  expireTs: 0,
  token: ''
};

function getTokenPromise() {
    return new Promise((resolve, reject) => {
        const tsNow = Math.floor((new Date()).getTime() / 1000);
        if ((accessToken.expireTs || 0) - tsNow < 600) {
            console.log('[TDX] Access token expired, fetching new token');
            axios.post(API_TOKEN_URL, qs.stringify({
                'grant_type': 'client_credentials',
                'client_id': TW_MOTC_TDX_APP_ID,
                'client_secret': TW_MOTC_TDX_APP_KEY,
            }), {
                headers: {
                    'content-type': 'application/x-www-form-urlencoded'
                }
            }).then((res) => {
                const data = res.data;
                console.log("[TDX] Received new access token", data);
                accessToken.token = data.access_token;
                accessToken.expireTs = tsNow + data.expires_in;
                resolve(accessToken.token);
            });
        } else {
            //console.log('use existing token');
            resolve(accessToken.token);
        }
    });
}

function callAPI(path, queryInput) {
    return getTokenPromise().then((token) => {
        const query = Object.assign({
            '$top': 1000,
            '$format': 'JSON'
        }, queryInput || {});
        const queryPair = [];
        Object.keys(query).forEach((key) => {
            queryPair.push(key + '=' + encodeURIComponent(query[key]));
        });
        return axios.get(API_BASE_URL + path + "?" + queryPair.join('&'), {
            headers: {
                'authorization': 'Bearer ' + token
            }
        }).then(res => res.data).catch((err) => {
            if (err.response && err.response.status === 401) {
                accessToken.expireTs = 0;
            }
            throw Error(err);
        });
    });
}

module.exports = {
    makeSureToken: function () {
        return getTokenPromise();
    },
    getLiveStatusTRA: (stationId, cb) => {
        return callAPI('/v3/Rail/TRA/StationLiveBoard', {
            '$filter': `StationID eq '${stationId}'`
        });
    },
    getTimeTablesTRA: () => {
        const t = new Date(tsMsNow + 3600000 * 8);
        const cstDateStr = t.getUTCFullYear() + '-' + (t.getUTCMonth() + 1) + '-' + t.getUTCDate();
        const cacheFileName = 'cache_tra_today_time_table.json';
        let cachedTimeTable = null;
        return new Promise((resolve, reject) => {
            fs.readFile(cacheFileName, 'utf8', (err, data) => {
                if (!err) {
                    cachedTimeTable = JSON.parse(data);
                }
                if (cachedTimeTable && cachedTimeTable[cstDateStr]) {
                    resolve(cachedTimeTable[cstDateStr]);
                } else {
                    callAPI('/v3/Rail/TRA/DailyTrainTimetable/Today').then(function(data){
                        cachedTimeTable = {};
                        cachedTimeTable[cstDateStr] = data.TrainTimetables;
                        fs.writeFile(cacheFileName, JSON.stringify(cachedTimeTable), () => {
                            resolve(data.TrainTimetables);
                        });
                    });
                }
            });
        });
    },
    getNewsTRA: () => {
        return Promise.all([
            callAPI('/v3/Rail/TRA/News'),
            callAPI('/v3/Rail/TRA/Alert'),
        ]).then(responses => {
            const newsItems = [];
            responses[0].Newses.forEach((newsRawItem) => {
                const tsUpdatedTime = (new Date(newsRawItem.UpdateTime)).getTime();
                if (tsMsNow - tsUpdatedTime < 86400000) {
                    newsItems.push({
                        srcId: newsRawItem.NewsID,
                        type: 'news',
                        title: newsRawItem.Title,
                        description: newsRawItem.Description,
                    });
                }
            });
            responses[1].Alerts.forEach((alertRawItem) => {
                const tsUpdatedTime = (new Date(alertRawItem.UpdateTime)).getTime();
                if (tsMsNow - tsUpdatedTime < 86400000 && alertRawItem.Status != 1) {
                    newsItems.push({
                        srcId: alertRawItem.AlertID,
                        type: 'alert',
                        title: alertRawItem.Title,
                        description: alertRawItem.Description,
                    });
                }
            });
            return newsItems;
        });
    },
    getLiveStatusTHSR: (stationId) => {
        return callAPI('/v2/Rail/THSR/AvailableSeatStatusList/' + stationId);
    },
    getNewsTHSR: (cb) => {
        return Promise.all([
            callAPI('/v2/Rail/THSR/News'),
            callAPI('/v2/Rail/THSR/AlertInfo'),
        ]).then(responses => {
          const newsItems = [];
          responses[0].forEach((newsRawItem) => {
              const tsUpdatedTime = (new Date(newsRawItem.UpdateTime)).getTime();
              if (tsMsNow - tsUpdatedTime < 86400000) {
                  newsItems.push({
                      srcId: newsRawItem.NewsID,
                      type: 'news',
                      title: newsRawItem.Title,
                      //description: newsRawItem.Description, // can be HTML
                      url: newsRawItem.NewsUrl,
                  });
              }
          });
          responses[1].forEach((alertRawItem) => {
              const tsUpdatedTime = (new Date(alertRawItem.UpdateTime)).getTime();
              if (tsMsNow - tsUpdatedTime < 86400000 && alertRawItem.Level == 2) {
                  newsItems.push({
                      type: 'alert',
                      title: alertRawItem.Title,
                      description: alertRawItem.Description,
                  });
              }
          });
          return newsItems;
        });
    },
};
