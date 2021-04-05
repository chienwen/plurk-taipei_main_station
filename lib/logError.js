const fs = require('fs');

module.exports = function(obj) {
    fs.appendFileSync('error_report.txt', "===================\n" + JSON.stringify(obj) + "\n");
};
