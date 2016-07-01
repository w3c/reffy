var refParser = require('./parse-references');
var webidlExtractor = require('./extract-webidl');
var loadSpecification = require('./util').loadSpecification;
var webidlParser = require('./parse-webidl');
var fetch = require('node-fetch');
var fs = require('fs');

/**
 * Extracts the title of the loaded document
 */
function titleExtractor(window) {
    return window.document.querySelector("title").textContent.trim();
}


/**
 * Return the given URL along with the W3C shortname for that specification
 *
 * @function
 * @private
 * @param {String} url The URL to enrich
 * @return {{url: String, shortname: String} The beginning of a spec description
 *   structure that contains the URL along with the shortname, when possible
 */
function getShortname(url) {
    var res = { url };
    if (!url.match(/www.w3.org\/TR\//)) {
        return res;
    }
    if (url.match(/TR\/[0-9]+\//)) {
        // dated version
        var statusShortname = url.split('/')[5];
        res.shortname = statusShortname.split('-').slice(1, -1).join('-');
        return res;
    }
    // latest version
    res.shortname = url.split('/')[4];
    return res;
}


/**
 * Enrich the spec description with the URL of the latest editor's draft,
 * and with the title of the specification, provided that the specification
 * is a W3C spec.
 *
 * @function
 * @param {Object} spec Spec description structure (only the URL is useful)
 * @return {Objec} The same structure, enriched with the URL of the latest
 *   draft when one is found
 */
function getSpecFromW3CApi(spec) {
    var shortname = spec.shortname;
    var config = require('./config.json');
    var authParam = '?apikey=' + config.w3cApiKey;
    if (!shortname) {
        return spec;
    }
    var bogusEditorDraft = ['webmessaging', 'eventsource', 'webstorage', 'progress-events', 'payment-method-basic-card', 'payment-request'];
    var unparseableEditorDraft = ['image-capture', 'requestidlecallback', 'performance-timeline-2', 'beacon', 'preload'];
    if ((bogusEditorDraft.indexOf(shortname) !== -1)
        || (unparseableEditorDraft.indexOf(shortname) !== -1)) {
        spec.latest = 'http://www.w3.org/TR/' + shortname;
        return spec;
    }
    return fetch('https://api.w3.org/specifications/' + shortname + authParam)
        .then(r =>  r.json())
        .then(s => fetch(s._links['latest-version'].href + authParam))
        .then(r => r.json())
        .then(s => {
            spec.latest = (s['editor-draft'] ? s['editor-draft'] : s.uri);
            return spec;
        })
        .catch(e => {
            spec.latest = 'http://www.w3.org/TR/' + shortname;
            return spec;
        });
}


/**
 * Given a list of URLs, create a list of specification descriptions
 *
 * The description will include the URL of the spec, its shortname if possible,
 * the URL of the latest version, and the title of the spec for W3C specs
 *
 * @function
 * @param {Array(String)} list The list of specification URLs
 * @return {Promise<Array(Object)} The promise to get a list of spec
 *  descriptions.
 */
function createInitialSpecDescriptions(list) {
    return Promise.all(list.map(getShortname).map(getSpecFromW3CApi));
}


/**
 * Main method that crawls the list of specification URLs and return a structure
 * that full describes its title, URLs, references, and IDL definitions.
 *
 * @function
 * @param {Array(String)} speclist List of URLs to parse
 * @return {Promise<Array(Object)} The promise to get an array of complete
 *   specification descriptions
 */
function crawlList(speclist) {
    function getRefAndIdl(spec) {
        var url = spec.latest ? spec.latest : spec.url;
        return loadSpecification(url).then(
            dom => Promise.all([
                spec,
                titleExtractor(dom),
                refParser.extract(dom).catch(err => err),
                webidlExtractor.extract(dom).then(idl => webidlParser.parse(idl)).catch(err => err),
                dom
                    ]))
            .then(res => {
                res[4].close();
                var spec = res[0];
                spec.title = spec.title ? spec.title : res[1];
                spec.refs = res[2];
                spec.idl = res[3];
                return spec;
            });
    }

    return createInitialSpecDescriptions(speclist)
        .then(list => Promise.all(list.map(getRefAndIdl)));
}


/**
 * Append the resulting data to the given file
 *
 * @function
 * @param {Array(Object)} data The list of specification structures to save
 * @param {String} path The path to the file to save
 * @return {Promise<void>} The promise to have saved the data
 */
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


/**
 * Processes a chunk of the initial list and move on the next chunk afterwards
 *
 * Note that we can probably drop this processing now that memory issues have
 * been solved.
 *
 * @function
 * @private
 */
function processChunk(list, remain, resultsPath, chunkSize) {
    return crawlList(list)
        .then(data => saveResults(data, resultsPath))
        .then(() => {
            if (remain.length) {
                return processChunk(remain.splice(0, chunkSize), remain, resultsPath, chunkSize);
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
