const axios = require('axios');
const jsSHA = require('jssha');
const config = require('./config');
const TW_MOTC_PTX_APP_ID = config('TW_MOTC_PTX_APP_ID');
const TW_MOTC_PTX_APP_KEY = config('TW_MOTC_PTX_APP_KEY');
const API_BASE_URL = 'https://ptx.transportdata.tw/MOTC';

function callAPI(path, queryInput) {
    const GMTString = new Date().toGMTString();
    const ShaObj = new jsSHA('SHA-1', 'TEXT');
    ShaObj.setHMACKey(TW_MOTC_PTX_APP_KEY, 'TEXT');
    ShaObj.update('x-date: ' + GMTString);
    const Authorization = 'hmac username=\"' + TW_MOTC_PTX_APP_ID + '\", algorithm=\"hmac-sha1\", headers=\"x-date\", signature=\"' + ShaObj.getHMAC('B64') + '\"';
    const query = Object.assign({
        '$top': 300,
        format: 'JSON'
    }, queryInput || {});
    const queryPair = [];
    Object.keys(query).forEach((key) => {
        queryPair.push(key + '=' + encodeURIComponent(query[key]));
    });
    return axios.get(API_BASE_URL + path + "?" + queryPair.join('&'), {
        headers: {
            Authorization,
            'X-Date': GMTString
        }
    })
}

module.exports = {
    getLiveStatusTRA: (stationId, cb) => {
        callAPI('/v3/Rail/TRA/StationLiveBoard', {
            '$filter': `StationID eq '${stationId}'`
        }).then(function(response){
            cb(response.data);
        });
    },
    getTimeTableTRA: (trainNo, cb) => {
        callAPI('/v3/Rail/TRA/DailyTrainTimetable/Today/TrainNo/' + trainNo).then(function(response){
            cb(response.data.TrainTimetables[0]);
        });
    },
};
