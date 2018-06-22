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
const { fork } = require('child_process');
const refParser = require('./parse-references');
const webidlExtractor = require('./extract-webidl');
const loadSpecification = require('../lib/util').loadSpecification;
const webidlParser = require('./parse-webidl');
const fetch = require('../lib/util').fetch;
const specEquivalents = require('../specs/spec-equivalents.json');
const canonicalizeURL = require('../lib/canonicalize-url').canonicalizeURL;
const requireFromWorkingDirectory = require('../lib/util').requireFromWorkingDirectory;

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
 * Complete the given spec object with the W3C shortname for that specification
 * if it exists
 *
 * @function
 * @private
 * @param {Object} spec The specification object to enrich
 * @return {Object} same object completed with a "shortname" key
 */
function completeWithShortName(spec) {
    if (!spec.url.match(/www.w3.org\/TR\//)) {
        return spec;
    }
    if (spec.url.match(/TR\/[0-9]+\//)) {
        // dated version
        var statusShortname = spec.url.split('/')[5];
        spec.shortname = statusShortname.split('-').slice(1, -1).join('-');
        return spec;
    }
    spec.shortname = spec.url.split('/')[4];
    return spec;
}


/**
 * Enrich the spec description based on information returned by the W3C API.
 *
 * Information typically includes the title of the spec, the link to the
 * Editor's Draft, to the latest published version, and the history of
 * published versions.
 *
 * For non W3C spec, the function basically returns the same object.
 *
 * @function
 * @param {Object} spec Spec description structure (only the URL is useful)
 * @return {Promise<Object>} The same structure, enriched with the URL of the editor's
 *   draft when one is found
 */
function completeWithInfoFromW3CApi(spec) {
    var shortname = spec.shortname;
    var config = requireFromWorkingDirectory('config.json');
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
        if (spec.latest && (spec.latest !== spec.url)) {
            spec.versions.add(spec.latest);
        }
        if (spec.edDraft && (spec.edDraft !== spec.url)) {
            spec.versions.add(spec.edDraft);
        }
        if (specEquivalents[spec.url]) spec.versions = new Set([...spec.versions, ...specEquivalents[spec.url]]);
    }

    if (!shortname) {
        addKnownVersions();
        spec.versions = [...spec.versions];
        return spec;
    }
    return fetch('https://api.w3.org/specifications/' + shortname, options)
        .then(r =>  r.json())
        .then(s => fetch(s._links['version-history'].href + '?embed=1', options))
        .then(r => r.json())
        .then(s => {
            const versions = s._embedded['version-history'].map(prop("uri")).map(canonicalizeURL);
            const editors = s._embedded['version-history'].map(prop("editor-draft")).filter(u => !!u).map(canonicalizeURL);
            const latestVersion = s._embedded['version-history'][0];
            spec.title = latestVersion.title;
            if (!spec.latest) spec.latest = latestVersion.shortlink;
            if (latestVersion.uri) {
                spec.datedUrl = latestVersion.uri;
                spec.datedStatus = latestVersion.status;
            }
            if (latestVersion['editor-draft']) spec.edDraft = latestVersion['editor-draft'];
            spec.versions = new Set([...spec.versions, ...versions, ...editors]);
            return spec;
        })
        .catch(e => {
            spec.error = e.toString() + (e.stack ? ' ' + e.stack : '');
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
 * Retrieve the repository for each spec from Specref
 *
 * @function
 * @param {Array} specs The list of specs to enrich
 * @return {Promise<Array>} The same structure, enriched with the URL of the
 *   repository when known.
 */
function completeWithInfoFromSpecref(specs) {
    return fetch('https://api.specref.org/reverse-lookup?urls=' +
            specs.map(s => s.latest || s.url).join(','))
        .then(r =>  r.json())
        .then(res => {
            specs.forEach(spec => {
                let url = spec.latest || spec.url;
                if (res[url]) {
                    if (res[url].repository) {
                        spec.repository = res[url].repository;
                    }
                }
            });
            return specs;
        })
        .catch(err => {
            console.warn('Specref returned an error', url, err);
            return specs;
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
    return loadSpecification({ html: spec.html, url: spec.crawled })
        .then(dom => Promise.all([
            spec,
            titleExtractor(dom),
            linkExtractor(dom),
            refParser.extract(dom).catch(err => {
                console.error(spec.crawled, err);
                return err;
            }),
            webidlExtractor.extract(dom)
                .then(idl =>
                    Promise.all([
                        idl,
                        webidlParser.parse(idl),
                        webidlParser.hasObsoleteIdl(idl)
                    ])
                    .then(([idl, parsedIdl, hasObsoletedIdl]) => {
                        parsedIdl.hasObsoleteIdl = hasObsoletedIdl;
                        parsedIdl.idl = idl;
                        return parsedIdl;
                    })
                    .catch(err => {
                        // IDL content is invalid and cannot be parsed.
                        // Let's return the error, along with the raw IDL
                        // content so that it may be saved to a file.
                        console.error(spec.crawled, err);
                        err.idl = idl;
                        return err;
                    })),
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
            spec.error = err.toString() + (err.stack ? ' ' + err.stack : '');
            return spec;
        });
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

    async function crawlSpecInChildProcess(spec) {
        return new Promise(resolve => {
            let resolved = false;
            let timeout = null;

            function reportSuccess(result) {
                if (resolved) {
                    console.warn('Got a second resolution for crawl in a child process');
                    return;
                }
                resolved = true;
                clearTimeout(timeout);
                resolve(result);
            }

            function reportError(err) {
                if (resolved) {
                    console.warn('Got a second error for crawl in a child process');
                    return;
                }
                resolved = true;
                resolve(Object.assign(spec, {
                    error: err.toString() + (err.stack ? ' ' + err.stack : '')
                }));
            }

            // Spawn a child process
            // NB: passing the spec URL is useless but gives useful info when
            // looking at processes during debugging in the task manager
            let child = fork(path.join(__dirname, 'crawl-specs.js'), [
                    '--child', spec.url, (crawlOptions.publishedVersion ? 'tr' : 'ed')
                ]);
            child.once('message', result => reportSuccess(result));
            child.once('exit', code => {
                clearTimeout(timeout);
                if (code && (code !== 0)) {
                    reportError(new Error(`Crawl exited with code ${code}`));
                }
                else if (!resolved) {
                    reportError(new Error(`Crawl exited without sending result`));
                }
            });

            timeout = setTimeout(_ => {
                console.warn(spec.url, 'Crawl timeout');
                reportError(new Error('Crawl took too long'));
                child.kill();
            }, 60000);

            child.send(spec);
        });
    }

    return createInitialSpecDescriptions(speclist)
        .then(list => {
            // Process specs in chunks not to create too many child processes
            // at once
            return new Promise(resolve => {
                const chunkSize = 10;
                let results = [];
                let pos = 0;
                let running = 0;

                // Process the next spec in the list
                // and report where all specs have been run
                async function crawlOneMoreSpec(result) {
                    if (pos < list.length) {
                        running += 1;
                        crawlSpecInChildProcess(list[pos], crawlOptions)
                            .then(result => {
                                results.push(result);
                                running -= 1;
                                crawlOneMoreSpec();
                            });
                        pos += 1;
                    }
                    else if (running === 0) {
                        // No more spec to crawl, and no more running spec
                        running = -1;
                        resolve(results);
                    }
                }

                // Process the first chunk
                for (let i = 0; i < chunkSize; i += 1) {
                    crawlOneMoreSpec();
                }
            });
        });
}


function getShortname(spec) {
  if (spec.shortname) {
    // do not include versionning
    return spec.shortname.replace(/-?[0-9\.]*$/, '');
  }
  const whatwgMatch = spec.url.match(/\/\/(.*)\.spec.whatwg.org\/$/);
  if (whatwgMatch) {
    return whatwgMatch[1];
  }
  const khronosMatch = spec.url.match(/https:\/\/www.khronos.org\/registry\/webgl\/specs\/latest\/([12]).0\/$/);
  if (khronosMatch) {
    return "webgl" + khronosMatch[1];
  }
  const githubMatch = spec.url.match(/\/.*.github.io\/([^\/]*)\//);
  if (githubMatch) {
    return githubMatch[1];
  }
  return spec.url.replace(/[^-a-z0-9]/g, '');
}

/**
 * Append the resulting data to the given file.
 *
 * Note results are sorted by URL to guarantee that the crawl report produced
 * will always follow the same order.
 *
 * @function
 * @param {Object} crawlInfo Crawl information structure, contains the title
 *   and the list of specs to crawl
 * @param {Object} crawlOptions Crawl options
 * @param {Array(Object)} data The list of specification structures to save
 * @param {String} folder The path to the report folder
 * @return {Promise<void>} The promise to have saved the data
 */
function saveResults(crawlInfo, crawlOptions, data, folder) {
    return new Promise((resolve, reject) => {
        let idlFolder = path.join(folder, 'idl');
        fs.mkdir(idlFolder, (err => {
            if (err && (err.code !== 'EEXIST')) return reject(err);
            return resolve(idlFolder);
        }));
    })
    .then(idlFolder => Promise.all(data.map(spec =>
        new Promise((resolve, reject) => {
            if (spec.idl && spec.idl.idl) {
                let idlHeader = `
                    // GENERATED CONTENT - DO NOT EDIT
                    // Content of this file was automatically extracted from the
                    // "${spec.title}" spec.
                    // See: ${spec.crawled}`;
                idlHeader = idlHeader.replace(/^\s+/gm, '').trim() + '\n\n';
                let idl = spec.idl.idl
                    .replace(/\s+$/gm, '\n')
                    .trim();
                idl = idlHeader + idl + '\n';
                fs.writeFile(
                    path.join(idlFolder, getShortname(spec) + '.idl'),
                    idl,
                    err => {
                        if (err) console.log(err);
                        return resolve();
                    });
                delete spec.idl.idl;
          } else resolve();
        }))).then(_ => new Promise((resolve, reject) => {
            let reportFilename = path.join(folder, 'crawl.json');
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
            });
        }))
    );
}


function assembleListOfSpec(filename, nested) {
    let crawlInfo = requireFromWorkingDirectory(filename);
    if (Array.isArray(crawlInfo)) {
        crawlInfo = { list: crawlInfo };
    }
    crawlInfo.list = crawlInfo.list.map(item => item.file ?
        assembleListOfSpec(path.resolve(path.dirname(filename), item.file), true) :
        item);
    crawlInfo.list = flatten(crawlInfo.list);
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
        publishedVersion: (process.argv[4] === 'tr')
    };

    if (speclistPath === '--child') {
        // Program run as child process of a parent crawl, wait for the spec
        // info and send the result using message passing
        process.once('message', spec =>
            crawlSpec(spec, crawlOptions)
                .then(result => process.send(result)));
    }
    else {
        // Process the file and crawl specifications it contains
        crawlFile(speclistPath, resultsPath, crawlOptions)
            .then(data => {
                console.log('finished');
            })
            .catch(err => {
                console.error(err);
            });
    }
}
