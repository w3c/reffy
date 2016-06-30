var refParser = require('./parse-references');
var webidlExtractor = require('./extract-webidl');
var loadSpecification = require('./util').loadSpecification;
var webidlParser = require('./parse-webidl');
var fetch = require('node-fetch');
var fs = require('fs');

function titleExtractor(window) {
    return window.document.querySelector("title").textContent;
}


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
    var bogusEditorDraft = ["webmessaging", "eventsource", "webstorage", "progress-events"];
    var unparseableEditorDraft = ["image-capture", "requestidlecallback", "performance-timeline-2"];
    if (bogusEditorDraft.indexOf(shortname) !== -1
        || unparseableEditorDraft.indexOf(shortname) !== -1) {
        return "http://www.w3.org/TR/" + shortname;
    }
    return fetch('https://api.w3.org/specifications/' + shortname + '' + authParam)
        .then(r =>  r.json())
        .then(s => fetch(s._links["latest-version"].href + authParam))
        .then(r =>  r.json())
        .then(s => s["editor-draft"] ? s["editor-draft"] : s.uri)
        .catch(e =>  "http://www.w3.org/TR/" + shortname);
}

function latestSpec(list) {
    return Promise.all(list.map(getShortname).map(getLatest));
}

function crawlList(speclist) {
    function getRefAndIdl(url) {
        return loadSpecification(url).then(
            dom => Promise.all([
                url,
                titleExtractor(dom),
                refParser.extract(dom).catch(err => err),
                webidlExtractor.extract(dom).then(idl => webidlParser.parse(idl)).catch(err => err),
                dom
                    ]))
            .then(res => { res[4].close(); return { url: res[0], title: res[1], refs: res[2], idl: res[3]};});
    }

    return Promise.all(speclist.map(getRefAndIdl));
}

function saveResults(data, path) {
    return new Promise((resolve, reject) => {
        fs.readFile(path, function(err, content) {
            if (err) return reject(err);
            var existingdata = [];
            try {
                existingdata = JSON.parse(content);
            } catch (e) {}
            var newdata = existingdata.concat(data);
            fs.writeFile(path, JSON.stringify(newdata, null, 2),
                         err => { if (err) return reject(err); resolve();});
        });
    });
}

function processChunk(list, remain, resultsPath, chunkSize) {
    return latestSpec(list)
        .then(crawlList)
        .then(data => saveResults(data, resultsPath))
        .then(() => {
            if (remain.length) {
                return processChunk(remain.splice(0, chunkSize), remain, resultsPath,  chunkSize);
            }
        });
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
    var resultsPath = process.argv[3];
    if (!speclistPath || !resultsPath) {
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
    try {
        fs.writeFileSync(resultsPath, "");
    } catch (e) {
        console.error("Impossible to write to " + resultsPath + ": " + e);
        process.exit(3);
    }
    // splitting list to avoid memory exhaustion
    var chunkSize = 80;
    var sublist = speclist.splice(0, chunkSize);
    processChunk(sublist, speclist, resultsPath, chunkSize)
        .then(function (data) {
            console.log("Finished");
        })
        .catch(function (err) {
            console.error(err);
            process.exit(64);
        });
}
