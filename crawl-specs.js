var refParser = require('./parse-references');
var webidlExtractor = require('./extract-webidl');
var loadSpecification = require('./util').loadSpecification;
var webidlParser = require('./parse-webidl');
var fetch = require('./util').fetch;
var fs = require('fs');
var specEquivalents = require('./spec-equivalents.json');
var canonicalizeURL = require('./canonicalize-url');

/**
 * Flattens an array
 */
const flatten = arr => arr.reduce(
    (acc, val) => acc.concat(Array.isArray(val) ? flatten(val) : val),
    []);


/**
 * Compares specs for ordering by URL
 */
const byURL = (a, b) => a.url.localeCompare(b.url);


/**
 * Shortcut that returns a property extractor iterator
 */
const prop = p => x => x[p];


/**
 * Extracts the title of the loaded document
 */
function titleExtractor(window) {
    var title = window.document.querySelector("title");
    if (window.location.href === 'https://html.spec.whatwg.org/multipage/workers.html') {
        // Web Worker ED is a page of the HTML Living Standard.
        // Report the appropriate title (crawler will still be confused because
        // it won't find any normative references at the end of this page)
        return 'Web Workers';
    }
    else if (title) {
        return title.textContent.trim();
    }
    else {
        return '[No title found for ' + window.location.href + ']';
    }
}

/**
 * Extract and canonicalize absolute links of the document
 * FIXME: ⚠ Modify the DOM
*/
function linkExtractor(window) {
    // Ignore links from the "head" section, which either link to
    // self, the GitHub repo, the implementation report, and other
    // documents that don't need to appear in the list of references.
    [...window.document.querySelectorAll('.head a[href]')].forEach(n => n.href='');
    const links = new Set([...window.document.querySelectorAll('a[href^=http]')]
        .map(n => canonicalizeURL(n.href)));
    return [...links];
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
    var options = {
        headers: {
            Authorization: 'W3C-API apikey="' + config.w3cApiKey + '"'
        }
    };

    // Note the mapping between some of the specs (e.g. HTML5.1 and HTML5)
    // is hardcoded below. In an ideal world, it would be easy to get that
    // info from the W3C API.
    spec.versions = new Set();
    function addKnownVersions() {
        spec.versions.add(spec.url);
        if (spec.latest) {
            spec.versions.add(spec.latest);
        }
        if (specEquivalents[spec.url]) spec.versions = new Set([...spec.versions, ...specEquivalents[spec.url]]);
    }

    if (!shortname) {
        addKnownVersions();
        spec.versions = [...spec.versions];
        return spec;
    }
    var bogusEditorDraft = ['webmessaging', 'eventsource', 'webstorage', 'progress-events', 'uievents'];
    var unparseableEditorDraft = [];
    if (bogusEditorDraft.includes(shortname)
        || unparseableEditorDraft.includes(shortname)) {
        spec.latest = 'https://www.w3.org/TR/' + shortname;
    }
    return fetch('https://api.w3.org/specifications/' + shortname, options)
        .then(r =>  r.json())
        .then(s => fetch(s._links['version-history'].href + '?embed=1', options))
        .then(r => r.json())
        .then(s => {
            const versions = s._embedded['version-history'].map(prop("uri")).map(canonicalizeURL);
            const editors = s._embedded['version-history'].map(prop("editors-draft")).filter(u => !!u).map(canonicalizeURL);
            const latest = s._embedded['version-history'][0];
            spec.title = latest.title;
            if (!spec.latest) spec.latest = (latest['editor-draft'] ? latest['editor-draft'] : latest.uri);
            spec.versions = new Set([...spec.versions, ...versions, ...editors]);
            return spec;
        })
        .catch(e => {
            spec.error = e.toString();
            spec.latest = 'https://www.w3.org/TR/' + shortname;
            return spec;
        })
        .then(spec => {
            addKnownVersions();
            spec.versions = [...spec.versions];
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
        spec.title = spec.title || (spec.shortname ? spec.shortname : spec.url);
        spec.date = "";
        spec.links = [];
        spec.refs = {};
        spec.idl = {};
        if (spec.error) {
            return spec;
        }
        const url = spec.latest ? spec.latest : spec.url;
        return loadSpecification(url)
            .then(dom => Promise.all([
                spec,
                titleExtractor(dom),
                linkExtractor(dom),
                refParser.extract(dom).catch(err => {console.error(url, err); return err;}),
                webidlExtractor.extract(dom)
                    .then(idl => Promise.all([
                        webidlParser.parse(idl),
                        webidlParser.hasObsoleteIdl(idl)
                    ])
                    .then(res => { res[0].hasObsoleteIdl = res[1]; return res[0] })
                    .catch(err => { console.error(url, err); return err; })),
                dom
            ]))
            .then(res => {
                const spec = res[0];
                const doc = res[5].document;
                const statusAndDateElement = doc.querySelector('.head h2');
                const date = (statusAndDateElement ?
                    statusAndDateElement.textContent.split(/\s+/).slice(-3).join(' ') :
                    (new Date(Date.parse(doc.lastModified))).toDateString());

                spec.title = res[1] ? res[1] : spec.title;
                spec.date = date;
                spec.links = res[2];
                spec.refs = res[3];
                spec.idl = res[4];
                res[5].close();
                return spec;
            })
            .catch(err => {
                spec.error = err.toString();
                return spec;
            });
    }

    return createInitialSpecDescriptions(speclist)
        .then(list => Promise.all(list.map(getRefAndIdl)));
}


/**
 * Append the resulting data to the given file.
 *
 * Note results are sorted by URL to guarantee that the crawl report produced
 * will always follow the same order.
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

            let filedata = {};
            try {
                filedata = JSON.parse(content);
            } catch (e) {}

            filedata.date = filedata.date || (new Date()).toJSON();
            filedata.stats = {};
            filedata.results = (filedata.results || []).concat(data);
            filedata.results.sort(byURL);
            filedata.stats = {
                crawled: filedata.results.length,
                errors: filedata.results.filter(spec => !!spec.error).length
            };

            fs.writeFile(path, JSON.stringify(filedata, null, 2),
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
        speclist = require(speclistPath).map(s => s.file ? require(s.file) : s);
        speclist = flatten(speclist);
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
    var chunkSize = 10;
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
