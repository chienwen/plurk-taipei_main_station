const fs = require('fs');
const RECENT_POST_JSON_FILE_NAME = 'recentPost.json';
const RECENT_POST_SEC = 86400;

let recentPost;

function getCurrentTime() {
    const d = new Date();
    return Math.floor(d.getTime() / 1000);
}

module.exports = {
    init: function () {
        if (fs.existsSync(RECENT_POST_JSON_FILE_NAME)) {
            try {
                recentPost = JSON.parse(fs.readFileSync(RECENT_POST_JSON_FILE_NAME, {encoding:'utf8', flag:'r'}));
            } catch (e) {
                recentPost = {};
            }
        } else {
            recentPost = {};
        }
        const ts = getCurrentTime();
        const latestPost = {};
        Object.keys(recentPost).forEach((text) => {
            if (ts - recentPost[text] < RECENT_POST_SEC) {
                latestPost[text] = recentPost[text];
            }
        });
        recentPost = latestPost;
    },
    wasPosted: function (text) {
        return !!recentPost[text];
    },
    add: function (text) {
        recentPost[text] = getCurrentTime();
    },
    finish: function () {
        fs.writeFileSync(RECENT_POST_JSON_FILE_NAME, JSON.stringify(recentPost));
    }
};
