#!/usr/bin/env node
/**
 * The spec crawler takes a list of spec URLs as input, gathers some knowledge
 * about these specs (published versions, URL of the Editor's Draft, etc.),
 * fetches these specs, parses them, extracts relevant information that they
 * contain (such as the WebIDL they define, the list of specifications that they
 * reference, and links to external specs), and produces a crawl report with the
 * results of these investigations.
 *
 * The spec crawler can be called directly through:
 *
 * `node crawl-specs.js [listfile] [crawl folder] [option]`
 *
 * where `listfile` is the name of a JSON file that contains the list of URLs to
 * crawl, `crawl folder` is the name of the folder where the crawl report will
 * be created, and `option` is an optional parameter that can be set to `tr` to
 * tell the crawler to crawl the published version of W3C specifications
 * instead of the Editor's Draft.
 *
 * @module crawler
 */

const fs = require('fs');
const path = require('path');
const webidlParser = require('./parse-webidl');
const cssDfnParser = require('../lib/css-grammar-parser');
const fetch = require('../lib/util').fetch;
const requireFromWorkingDirectory = require('../lib/util').requireFromWorkingDirectory;
const completeWithInfoFromW3CApi = require('../lib/util').completeWithInfoFromW3CApi;
const completeWithShortName = require('../lib/util').completeWithShortName;
const getShortname = require('../lib/util').getShortname;
const processSpecification = require('../lib/util').processSpecification;

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
 * Retrieve the repository for each spec from Specref
 *
 * @function
 * @param {Array} specs The list of specs to enrich
 * @return {Promise<Array>} The same structure, enriched with the URL of the
 *   repository when known.
 */
function completeWithInfoFromSpecref(specs) {
    function chunkArray(arr, len) {
        let chunks = [];
        let i = 0;
        let n = arr.length;
        while (i < n) {
            chunks.push(arr.slice(i, i += len));
        }
        return chunks;
    }

    const chunks = chunkArray(specs, 20);
    return Promise.all(
        chunks.map(chunk => {
            let specrefUrl = 'https://api.specref.org/reverse-lookup?urls=' +
                  chunk.map(s => s.latest || s.url).join(',');
            return fetch(specrefUrl)
                .then(r =>  r.json())
                .then(res => {
                    chunk.forEach(spec => {
                        let url = spec.latest || spec.url;
                        if (res[url]) {
                            if (res[url].repository) {
                                spec.repository = res[url].repository;
                            }
                            if (res[url].title && !spec.title) {
                                spec.title = res[url].title;
                            }
                        }
                    });
                })
                .catch(err => {
                    console.warn('Specref returned an error', specrefUrl, err);
                });
        })
    ).then(_ => specs);
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
async function createInitialSpecDescriptions(list) {
    function createSpecObject(spec) {
        let res = {
            url: (typeof spec === 'string') ? spec : (spec.url || 'about:blank')
        };
        if ((typeof spec !== 'string') && spec.html) {
            res.html = spec.html;
        }
        return res;
    }

    return Promise.all(
        list.map(createSpecObject)
            .map(completeWithShortName)
            .map(completeWithInfoFromW3CApi))
        .then(completeWithInfoFromSpecref);
}


/**
 * Load and parse the given spec.
 *
 * @function
 * @param {Object} spec The spec to load (must already have been completed with
 *   useful info, as returned by "createInitialSpecDescriptions")
 * @param {Object} crawlOptions Crawl options
 * @return {Promise<Object>} The promise to get a spec object with crawl info
 */
async function crawlSpec(spec, crawlOptions) {
    spec.title = spec.title || (spec.shortname ? spec.shortname : spec.url);
    var bogusEditorDraft = ['webmessaging', 'eventsource', 'webstorage', 'progress-events'];
    var unparseableEditorDraft = [];
    spec.crawled = ((
            crawlOptions.publishedVersion ||
            bogusEditorDraft.includes(spec.shortname) ||
            unparseableEditorDraft.includes(spec.shortname)) ?
        spec.datedUrl || spec.latest || spec.url :
        spec.edDraft || spec.url);
    spec.date = "";
    spec.links = [];
    spec.refs = {};
    spec.idl = {};
    if (spec.error) {
        return spec;
    }

    try {
        const result = await processSpecification(spec.crawled, () => {
            return {
                crawled: window.location.toString(),
                title: window.reffy.getTitle(),
                date: window.reffy.getLastModifiedDate(),
                links: window.reffy.extractLinks(),
                refs: window.reffy.extractReferences(),
                idl: window.reffy.extractWebIdl(),
                css: window.reffy.extractCSS(),
            };
        });

        // Parse the extracted WebIdl content
        try {
            const parsedIdl = await webidlParser.parse(result.idl);
            parsedIdl.hasObsoleteIdl = webidlParser.hasObsoleteIdl(result.idl);
            parsedIdl.idl = result.idl;
            result.idl = parsedIdl;
        }
        catch (err) {
            // IDL content is invalid and cannot be parsed.
            // Let's return the error, along with the raw IDL
            // content so that it may be saved to a file.
            err.idl = result.idl;
            result.idl = err;
        }

        // Parse extracted CSS definitions
        Object.keys(result.css.properties || {}).forEach(prop => {
            try {
                result.css.properties[prop].parsedValue = cssDfnParser.parsePropDefValue(
                    result.css.properties[prop].value || result.css.properties[prop].newValues);
            } catch (e) {
                result.css.properties[prop].valueParseError = e.message;
            }
        });
        Object.keys(result.css.descriptors || {}).forEach(desc => {
            try {
                result.css.descriptors[desc].parsedValue = cssDfnParser.parsePropDefValue(
                    result.css.descriptors[desc].value);
            } catch (e) {
                result.css.descriptors[desc].valueParseError = e.message;
            }
        });
        Object.keys(result.css.valuespaces || {}).forEach(vs => {
            if (result.css.valuespaces[vs].value) {
                try {
                    result.css.valuespaces[vs].parsedValue = cssDfnParser.parsePropDefValue(
                        result.css.valuespaces[vs].value);
                } catch (e) {
                    result.css.valuespaces[vs].valueParseError = e.message;
                }
            }
        });

        // Copy results back into initial spec object
        spec.crawled = result.crawled;
        spec.title = result.title ? result.title : spec.title;
        spec.date = result.date;
        spec.links = result.links;
        spec.refs = result.refs;
        spec.idl = result.idl;
        spec.css = result.css;
    }
    catch (err) {
        spec.title = spec.title || '[Could not be determined, see error]';
        spec.error = err.toString() + (err.stack ? ' ' + err.stack : '');
    }

    return spec;
}


/**
 * Main method that crawls the list of specification URLs and return a structure
 * that full describes its title, URLs, references, and IDL definitions.
 *
 * @function
 * @param {Array(String)} speclist List of URLs to parse
 * @param {Object} crawlOptions Crawl options
 * @return {Promise<Array(Object)} The promise to get an array of complete
 *   specification descriptions
 */
async function crawlList(speclist, crawlOptions, resultsPath) {
    crawlOptions = crawlOptions || {};

    const list = await createInitialSpecDescriptions(speclist);
    const listAndPromise = list.map(spec => {
        let resolve = null;
        let reject = null;
        let readyToCrawl = new Promise((resolveFunction, rejectFunction) => {
            resolve = resolveFunction;
            reject = rejectFunction;
        });
        return { spec, readyToCrawl, resolve, reject };
    });

    // In debug mode, specs are processed one by one. In normal mode,
    // specs are processing in chunks
    const chunkSize = Math.min((crawlOptions.debug ? 1 : 4), list.length);

    let pos = 0;
    function flagNextSpecAsReadyToCrawl() {
        if (pos < listAndPromise.length) {
            listAndPromise[pos].resolve();
            pos += 1;
        }
    }
    for (let i = 0; i < chunkSize; i++) {
        flagNextSpecAsReadyToCrawl();
    }

    const nbStr = '' + listAndPromise.length;
    async function crawlSpecAndPromise(specAndPromise, idx) {
        await specAndPromise.readyToCrawl;
        const spec = specAndPromise.spec;
        const logCounter = ('' + (idx + 1)).padStart(nbStr.length, ' ') + '/' + nbStr;
        console.log(`${logCounter} - ${spec.url} - crawling`);
        const result = await crawlSpec(spec, crawlOptions);
        console.log(`${logCounter} - ${spec.url} - done`);
        flagNextSpecAsReadyToCrawl();
        return result;
    }

    const results = await Promise.all(listAndPromise.map(crawlSpecAndPromise));
    return results;
}


/**
 * Append the resulting data to the given file.
 *
 * Note results are sorted by URL to guarantee that the crawl report produced
 * will always follow the same order.
 *
 * The function also dumps raw CSS/IDL extracts for each spec to the css and
 * idl folders. Note that if the crawl contains multiple levels of a given spec
 * that contain the same type of definitions (css, or idl), the dump is for the
 * latest level.
 *
 * @function
 * @param {Object} crawlInfo Crawl information structure, contains the title
 *   and the list of specs to crawl
 * @param {Object} crawlOptions Crawl options
 * @param {Array(Object)} data The list of specification structures to save
 * @param {String} folder The path to the report folder
 * @return {Promise<void>} The promise to have saved the data
 */
async function saveResults(crawlInfo, crawlOptions, data, folder) {
    const idlFolder = await new Promise((resolve, reject) => {
        let idlFolder = path.join(folder, 'idl');
        fs.mkdir(idlFolder, (err => {
            if (err && (err.code !== 'EEXIST')) return reject(err);
            return resolve(idlFolder);
        }));
    });

    const cssFolder = await new Promise((resolve, reject) => {
        let cssFolder = path.join(folder, 'css');
        fs.mkdir(cssFolder, (err => {
            if (err && (err.code !== 'EEXIST')) return reject(err);
            return resolve(cssFolder);
        }));
    });

    const saveIdl = async spec => {
        let idlHeader = `
            // GENERATED CONTENT - DO NOT EDIT
            // Content was automatically extracted by Reffy into reffy-reports
            // (https://github.com/tidoust/reffy-reports)
            // Source: ${spec.title} (${spec.crawled})`;
        idlHeader = idlHeader.replace(/^\s+/gm, '').trim() + '\n\n';
        let idl = spec.idl.idl
            .replace(/\s+$/gm, '\n')
            .replace(/\t/g, '  ')
            .trim();
        idl = idlHeader + idl + '\n';
        delete spec.idl.idl;
        await new Promise(resolve => fs.writeFile(
            path.join(idlFolder, getShortname(spec) + '.idl'),
            idl,
            err => {
                if (err) console.log(err);
                return resolve();
            }));
    };

    const saveCss = async spec => {
        // There are no comments in JSON, so include the spec title+URL as the
        // first property instead.
        let css = {
            spec: {
                title: spec.title,
                url: spec.crawled
            }
        };
        Object.assign(css, spec.css);
        let json = JSON.stringify(css, (key, val) => {
            if ((key === 'parsedValue') || (key === 'valueParseError')) {
                return undefined;
            }
            else {
                return val;
            }
        }, 2) + '\n';
        await new Promise(resolve => fs.writeFile(
            path.join(cssFolder, getShortname(spec) + '.json'),
            json,
            err => {
                if (err) console.log(err);
                return resolve();
            }));
    };

    // Helper function that returns true when the given spec is is the latest
    // level of that spec in the crawl for the given type of content
    // ("css" or "idl"). Note the code handles the special case of the CSS2
    // and CSS22 specs, and assumes that URLs that don't end with a level
    // number are at level 1 (this does not work for CSS specs whose URLs still
    // follow the old `css3-` pattern, but we're only interested in comparing
    // with more recent levels in that case, so it does not matter)
    const isLatestLevel = (spec, flag) => {
        const getLevel = spec =>
            (spec.url.match(/-\d+\/$/) ?
            parseInt(spec.url.match(/-(\d+)\/$/)[1], 10) :
            (spec.url.match(/CSS22\/$/i) ? 2 : 1));
        const shortname = getShortname(spec);
        const level = getLevel(spec);
        const candidates = data.filter(s => s.flags[flag] &&
            (getShortname(s) === shortname) && (getLevel(s) >= level));

        // Note the list of candidates for this shortname includes the spec
        // itself. It is the latest level if there is no other candidate at
        // a strictly greater level, and if the spec under consideration is
        // the first element in the list (for the hopefully rare case where
        // we have two candidate specs that are at the same level)
        return !candidates.find(s => getLevel(s) > level) &&
            (candidates[0] === spec);
    };

    // Save IDL dumps for the latest level of a spec to the idl folder
    await Promise.all(data
        .filter(spec => spec.idl && spec.idl.idl)
        .filter(spec => isLatestLevel(spec, 'idl'))
        .map(saveIdl));

    // Save CSS dumps for the latest level of a spec to the css folder
    await Promise.all(data
        .filter(spec => spec.css && (
            (Object.keys(spec.css.properties || {}).length > 0) ||
            (Object.keys(spec.css.descriptors || {}).length > 0) ||
            (Object.keys(spec.css.valuespaces || {}).length > 0)))
        .filter(spec => isLatestLevel(spec, 'css'))
        .map(saveCss));

    // Save all results to the crawl.json file
    let reportFilename = path.join(folder, 'crawl.json');
    return new Promise((resolve, reject) =>
        fs.readFile(reportFilename, function(err, content) {
            if (err) return reject(err);

            let filedata = {};
            try {
                filedata = JSON.parse(content);
            } catch (e) {}

            filedata.type = filedata.type || 'crawl';
            filedata.title = crawlInfo.title || 'Reffy crawl';
            if (crawlInfo.description) {
                filedata.description = crawlInfo.description;
            }
            filedata.date = filedata.date || (new Date()).toJSON();
            filedata.options = crawlOptions;
            filedata.stats = {};
            filedata.results = (filedata.results || []).concat(data);
            filedata.results.sort(byURL);
            filedata.stats = {
                crawled: filedata.results.length,
                errors: filedata.results.filter(spec => !!spec.error).length
            };

            fs.writeFile(reportFilename, JSON.stringify(filedata, null, 2),
                         err => { if (err) return reject(err); return resolve();});
        })
    );
}


function assembleListOfSpec(filename, nested) {
    let crawlInfo = requireFromWorkingDirectory(filename);
    if (Array.isArray(crawlInfo)) {
        crawlInfo = { list: crawlInfo };
    }
    crawlInfo.list = crawlInfo.list
        .map(u => (typeof u === 'string') ? Object.assign({ url: u }) : u)
        .map(u => u.file ? assembleListOfSpec(path.resolve(path.dirname(filename), u.file), true) : u);
    crawlInfo.list = flatten(crawlInfo.list);
    crawlInfo.list = crawlInfo.list.filter(u => {
        const first = crawlInfo.list.find(s => s.url === u.url);
        return first === u;
    });
    return (nested ? crawlInfo.list : crawlInfo);
}


/**
 * Crawls the specifications listed in the given JSON file and generates a
 * crawl report in the given folder.
 *
 * @function
 * @param {String} speclistPath JSON file that contains the specifications to parse
 * @param {String} resultsPath Folder that is to contain the crawl report
 * @param {Object} options Crawl options
 * @return {Promise<void>} The promise that the crawl will have been made
 */
function crawlFile(speclistPath, resultsPath, options) {
    if (!speclistPath || !resultsPath) {
        return Promise.reject('Required folder parameter missing');
    }
    let crawlInfo;
    try {
        crawlInfo = assembleListOfSpec(speclistPath);
    } catch (err) {
        return Promise.reject('Impossible to read ' + speclistPath + ': ' + err);
    }
    try {
        fs.writeFileSync(path.join(resultsPath, 'crawl.json'), '');
    } catch (err) {
        return Promise.reject('Impossible to write to ' + resultsPath + ': ' + err);
    }

    return crawlList(crawlInfo.list, options, resultsPath)
        .then(results => saveResults(crawlInfo, options, results, resultsPath));
}


/**************************************************
Export the crawlList method for use as module
**************************************************/
module.exports.crawlList = crawlList;
module.exports.crawlFile = crawlFile;


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
    var speclistPath = process.argv[2];
    var resultsPath = process.argv[3];
    var crawlOptions = {
        publishedVersion: (process.argv[4] === 'tr'),
        debug: (process.argv[4] === 'debug') || (process.argv[5] === 'debug')
    };

    // Process the file and crawl specifications it contains
    crawlFile(speclistPath, resultsPath, crawlOptions)
        .then(data => {
            console.log('finished');
            process.exit(0);
        })
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}
