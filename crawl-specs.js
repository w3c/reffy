var refParser = require('./parse-references');
var webidlExtractor = require('./extract-webidl');
var webidlParser = require('./parse-webidl');
var fetch = require('node-fetch');

function getShortname(url) {
    if (!url.match(/www.w3.org\/TR\//)) {
        return url;
    }
    if (url.match(/TR\/[0-9]+\//)) {
        // dated version
        var statusShortname = url.split('/')[5];
        return statusShortname.split('-').slice(1, -1).join('-');
    }
    // latest version
    return url.split('/')[4];
}

function getLatest(shortname) {
    var config = require("./config.json");
    var authParam = '?apikey=' + config.w3cApiKey;
    if (shortname.match(/^http/)) {
        return shortname;
    }
    return fetch('https://api.w3.org/specifications/' + shortname + '' + authParam)
        .then(r =>  r.json())
        .then(s => fetch(s._links["latest-version"].href + authParam))
        .then(r =>  r.json())
        .then(s => s["editor-draft"] ? s["editor-draft"] : s.uri);
}

function latestSpec(list) {
    return Promise.all(list.map(getShortname).map(getLatest));
}

function crawlList(speclist) {
    function getRefAndIdl(url) {
        return Promise.all([
            url,
            refParser.extract(url).catch(err => err),
            webidlExtractor.extract(url).then(idl => webidlParser.parse(idl)).catch(err => err)
                ]).then(res => { return { url: res[0], refs: res[1], idl: res[2]};});
    }

    return Promise.all(speclist.map(getRefAndIdl));
}

/**************************************************
Export the crawlList method for use as module
**************************************************/
module.exports.crawlList = crawlList;


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
    var speclistPath = process.argv[2];
    if (!speclistPath) {
        console.error("Required filename parameter missing");
        process.exit(2);
    }
    var speclist;
    try {
        speclist = require(speclistPath);
    } catch(e) {
        console.error("Impossible to read " + speclistPath + ": " + e);
        process.exit(3);
    }
    latestSpec(speclist)
        .then(crawlList)
        .then(function (data) {
            console.log(JSON.stringify(data, null, 2));
        })
        .catch(function (err) {
            console.error(err);
            process.exit(64);
        });
}
