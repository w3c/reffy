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
const cssDfnExtractor = require('./extract-cssdfn');
const loadSpecification = require('../lib/util').loadSpecification;
const webidlParser = require('./parse-webidl');
const fetch = require('../lib/util').fetch;
const canonicalizeURL = require('../lib/canonicalize-url').canonicalizeURL;
const requireFromWorkingDirectory = require('../lib/util').requireFromWorkingDirectory;
const completeWithInfoFromW3CApi = require('../lib/util').completeWithInfoFromW3CApi;
const completeWithShortName = require('../lib/util').completeWithShortName;

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
        res.flags = {
            css: !!spec.css,
            idl: !!spec.idl
        };
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
            cssDfnExtractor.extract(dom),
            dom
        ]))
        .then(res => {
            const spec = res[0];
            const doc = res[6].document;
            const statusAndDateElement = doc.querySelector('.head h2');
            const date = (statusAndDateElement ?
                statusAndDateElement.textContent.split(/\s+/).slice(-3).join(' ') :
                (new Date(Date.parse(doc.lastModified))).toDateString());

            spec.title = res[1] ? res[1] : spec.title;
            spec.date = date;
            spec.links = res[2];
            spec.refs = res[3];
            spec.idl = res[4];
            spec.css = res[5];
            res[6].close();
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
            // NB: all fetch requests are processed by the parent process,
            // see fetch.js for details
            let child = fork(path.join(__dirname, 'crawl-specs.js'), [
                    '--child', spec.url, (crawlOptions.publishedVersion ? 'tr' : 'ed')
                ]);
            child.on('message', msg => {
                if (msg.type === 'result') {
                    reportSuccess(msg.result);
                }
                else if (msg.cmd === 'fetch') {
                    fetch(msg.url, msg.options)
                        .then(_ => child.send({
                            type: 'fetch',
                            reqId: msg.reqId
                        }))
                        .catch(err => child.send({
                            type: 'fetch',
                            reqId: msg.reqId,
                            err: err.toString()
                        }));
                }
            });
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
                                if (!result.crawled) {
                                    result.crawled = result.latest;
                                }
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
  const extensionMatch = spec.url.match(/\/.*.github.io\/([^\/]*)\/extension\.html$/);
  if (extensionMatch) {
    return extensionMatch[1] + '-extension';
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

    const saveCssAndIdl = async spec => {
        if (spec.flags.idl && spec.idl && spec.idl.idl) {
            let idlHeader = `
                // GENERATED CONTENT - DO NOT EDIT
                // Content of this file was automatically extracted from the
                // "${spec.title}" spec.
                // See: ${spec.crawled}`;
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
        }

        if (spec.flags.css && spec.css && (
                (Object.keys(spec.css.properties || {}).length > 0) ||
                (Object.keys(spec.css.descriptors || {}).length > 0) ||
                (Object.keys(spec.css.valuespaces || {}).length > 0))) {
            let properties = (Object.values(spec.css.properties || {}))
                .filter(s => s.Name && (s.Value || s['New values']))
                .map(s => s.Value ? `${s.Name} = ${s.Value}` :
                        `${s.Name} |= ${s['New values']}`);
            let descriptors = (Object.values(spec.css.descriptors || {}))
                .filter(s => s.Name && (s.Value || s['New values']))
                .map(s => s.Value ? `${s.Name} = ${s.Value}` :
                        `${s.Name} |= ${s['New values']}`);
            let valuespaces = (Object.keys(spec.css.valuespaces || {}))
                .filter(s => spec.css.valuespaces[s].value)
                .map(s => `${s} = ${spec.css.valuespaces[s].value}`);
            let parts = properties.concat(descriptors, valuespaces);

            let css = parts.join('\n\n')
                .replace(/\s+$/gm, '\n')
                .replace(/\t/g, '  ')
                .trim();
            css = css + '\n';
            await new Promise(resolve => fs.writeFile(
                path.join(cssFolder, getShortname(spec) + '.cvds'),
                css,
                err => {
                    if (err) console.log(err);
                    return resolve();
                }));
        }
    };

    // Only save CSS/IDL definitions for the last level of specifications
    // when the crawl contains multiple levels
    // (Note the code below assumes that levels are below 10)
    await Promise.all(data
        .filter(spec => {
            if (!spec.url.match(/-\d\/$/)) {
                // Handle special CSS 2.1 / CSS 2.2 spec which does not
                // follow the same naming conventions as other CSS specs
                return !spec.url.match(/CSS2\/$/i) ||
                    !data.find(s => s.url.match(/CSS22\/$/i));
            }
            let start = spec.url.split(/-\d\/$/)[0];
            let level = spec.url.match(/-(\d)\/$/)[1];
            let moreRecent = data.find(s =>
                s.url.startsWith(start) &&
                s.url.match(/-\d\/$/) &&
                (s.url.match(/-(\d)\/$/)[1] > level));
            return !moreRecent;
        })
        .map(saveCssAndIdl));

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
    if (filename.match(/-css/)) {
        crawlInfo.list.forEach(u => u.css = true);
    }
    if (filename.match(/-idl/)) {
        crawlInfo.list.forEach(u => u.idl = true);
    }
    crawlInfo.list = crawlInfo.list.filter((u, i) => {
        let first = crawlInfo.list.find(s => s.url === u.url);
        first.css = first.css || u.css;
        first.idl = first.idl || u.idl;
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
        publishedVersion: (process.argv[4] === 'tr')
    };

    if (speclistPath === '--child') {
        // Program run as child process of a parent crawl, wait for the spec
        // info and send the result using message passing
        process.once('message', spec =>
            crawlSpec(spec, crawlOptions)
                .then(result => {
                    process.send({ type: 'result', result });
                    process.removeAllListeners('message');
                }));
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
