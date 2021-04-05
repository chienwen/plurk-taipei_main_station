const fs = require('fs');
const path = require("path");
const ini = require('ini');
const filePath = path.resolve(__dirname, '../config.ini');
const config = ini.parse(fs.readFileSync(filePath, 'utf-8'));

module.exports = function(key) {
    return config[key];
};
