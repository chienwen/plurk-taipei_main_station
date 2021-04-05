const tsNow = (new Date()).getTime();
const axios = require('axios');
const jsSHA = require('jssha');
const fs = require('fs');
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
        //cb({"UpdateTime":"2021-04-05T21:52:08+08:00","UpdateInterval":20,"SrcUpdateTime":"2021-04-05T21:52:00+08:00","SrcUpdateInterval":60,"AuthorityCode":"TRA","StationLiveBoards":[{"StationID":"1000","StationName":{"Zh_tw":"臺北","En":"Taipei"},"TrainNo":"1272","Direction":0,"TrainTypeID":"1131","TrainTypeCode":"6","TrainTypeName":{"Zh_tw":"區間","En":"Local Train"},"EndingStationID":"0900","EndingStationName":{"Zh_tw":"基隆","En":"Keelung"},"TripLine":0,"Platform":"","ScheduleArrivalTime":"21:47:00","ScheduleDepartureTime":"21:48:00","DelayTime":8,"RunningStatus":1,"UpdateTime":"2021-04-05T21:51:53+08:00"},{"StationID":"1000","StationName":{"Zh_tw":"臺北","En":"Taipei"},"TrainNo":"4225","Direction":1,"TrainTypeID":"1131","TrainTypeCode":"6","TrainTypeName":{"Zh_tw":"區間","En":"Local Train"},"EndingStationID":"1150","EndingStationName":{"Zh_tw":"北湖","En":"Beihu"},"TripLine":0,"Platform":"","ScheduleArrivalTime":"21:49:00","ScheduleDepartureTime":"21:53:00","DelayTime":8,"RunningStatus":1,"UpdateTime":"2021-04-05T21:51:53+08:00"},{"StationID":"1000","StationName":{"Zh_tw":"臺北","En":"Taipei"},"TrainNo":"256","Direction":0,"TrainTypeID":"1107","TrainTypeCode":"2","TrainTypeName":{"Zh_tw":"普悠瑪","En":"Puyuma Express"},"EndingStationID":"7000","EndingStationName":{"Zh_tw":"花蓮","En":"Hualien"},"TripLine":0,"Platform":"","ScheduleArrivalTime":"21:55:00","ScheduleDepartureTime":"22:00:00","DelayTime":2,"RunningStatus":1,"UpdateTime":"2021-04-05T21:51:53+08:00"},{"StationID":"1000","StationName":{"Zh_tw":"臺北","En":"Taipei"},"TrainNo":"5841","Direction":1,"TrainTypeID":"1113","TrainTypeCode":"4","TrainTypeName":{"Zh_tw":"莒光","En":"Chu-Kuang Express"},"EndingStationID":"1210","EndingStationName":{"Zh_tw":"新竹","En":"Hsinchu"},"TripLine":0,"Platform":"","ScheduleArrivalTime":"21:32:00","ScheduleDepartureTime":"21:35:00","DelayTime":20,"RunningStatus":1,"UpdateTime":"2021-04-05T21:50:49+08:00"},{"StationID":"1000","StationName":{"Zh_tw":"臺北","En":"Taipei"},"TrainNo":"2","Direction":0,"TrainTypeID":"1111","TrainTypeCode":"4","TrainTypeName":{"Zh_tw":"莒光","En":"Chu-Kuang Express"},"EndingStationID":"1001","EndingStationName":{"Zh_tw":"臺北-環島","En":"Taipei Surround Island"},"TripLine":1,"Platform":"","ScheduleArrivalTime":"08:10:00","ScheduleDepartureTime":"08:10:00","DelayTime":11,"RunningStatus":1,"UpdateTime":"2021-04-05T21:50:45+08:00"},{"StationID":"1000","StationName":{"Zh_tw":"臺北","En":"Taipei"},"TrainNo":"441","Direction":1,"TrainTypeID":"1101","TrainTypeCode":"1","TrainTypeName":{"Zh_tw":"太魯閣","En":"Taroko Express"},"EndingStationID":"1040","EndingStationName":{"Zh_tw":"樹林","En":"Shulin"},"TripLine":0,"Platform":"","ScheduleArrivalTime":"21:20:00","ScheduleDepartureTime":"21:25:00","DelayTime":28,"RunningStatus":1,"UpdateTime":"2021-04-05T21:46:59+08:00"}]}); return; //DEBUG
        callAPI('/v3/Rail/TRA/StationLiveBoard', {
            '$filter': `StationID eq '${stationId}'`
        }).then(function(response){
            cb(response.data);
        });
    },
    getTimeTablesTRA: (cb) => {
        const t = new Date(tsNow + 3600000 * 8);
        const cstDateStr = t.getUTCFullYear() + '-' + (t.getUTCMonth() + 1) + '-' + t.getUTCDate();
        const cacheFileName = 'cache_tra_today_time_table.json';
        let cachedTimeTable = null;
        fs.readFile(cacheFileName, 'utf8', (err, data) => {
            if (!err) {
                cachedTimeTable = JSON.parse(data);
            }
            if (cachedTimeTable && cachedTimeTable[cstDateStr]) {
                cb(cachedTimeTable[cstDateStr]);
            } else {
                callAPI('/v3/Rail/TRA/DailyTrainTimetable/Today').then(function(response){
                    cachedTimeTable = {};
                    cachedTimeTable[cstDateStr] = response.data.TrainTimetables;
                    fs.writeFile(cacheFileName, JSON.stringify(cachedTimeTable), () => {
                        cb(response.data.TrainTimetables);
                    });
                });
            }
        });
    },
    getNewsTRA: (cb) => {
        const newsItems = [];
        callAPI('/v3/Rail/TRA/News').then(function(response){
            response.data.Newses.forEach((newsRawItem) => {
                const tsUpdatedTime = (new Date(newsRawItem.UpdateTime)).getTime();
                if (tsNow - tsUpdatedTime < 86400000) {
                    newsItems.push({
                        srcId: newsRawItem.NewsID,
                        type: 'news',
                        title: newsRawItem.Title,
                        description: newsRawItem.Description,
                    });
                }
            });
            callAPI('/v3/Rail/TRA/Alert').then(function(response){
                response.data.Alerts.forEach((alertRawItem) => {
                    const tsUpdatedTime = (new Date(alertRawItem.UpdateTime)).getTime();
                    if (tsNow - tsUpdatedTime < 86400000 && alertRawItem.Status != 1) {
                        newsItems.push({
                            srcId: alertRawItem.AlertID,
                            type: 'alert',
                            title: alertRawItem.Title,
                            description: alertRawItem.Description,
                        });
                    }
                });
                cb(newsItems);
            });
        });
    },
    getLiveStatusTHSR: (stationId, cb) => {
        callAPI('/v2/Rail/THSR/AvailableSeatStatusList/' + stationId).then(function(response){
            cb(response.data);
        });
    },
    getNewsTHSR: (cb) => {
        const newsItems = [];
        callAPI('/v2/Rail/THSR/News').then(function(response){
            response.data.forEach((newsRawItem) => {
                const tsUpdatedTime = (new Date(newsRawItem.UpdateTime)).getTime();
                if (tsNow - tsUpdatedTime < 86400000) {
                    newsItems.push({
                        srcId: newsRawItem.NewsID,
                        type: 'news',
                        title: newsRawItem.Title,
                        //description: newsRawItem.Description, // can be HTML
                        url: newsRawItem.NewsUrl,
                    });
                }
            });
            callAPI('/v2/Rail/THSR/AlertInfo').then(function(response){
                response.data.forEach((alertRawItem) => {
                    const tsUpdatedTime = (new Date(alertRawItem.UpdateTime)).getTime();
                    if (tsNow - tsUpdatedTime < 86400000 && alertRawItem.Level == 2) {
                        newsItems.push({
                            type: 'alert',
                            title: alertRawItem.Title,
                            description: alertRawItem.Description,
                        });
                    }
                });
                cb(newsItems);
            });
        });
    },
};
