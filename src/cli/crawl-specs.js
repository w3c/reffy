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
 * where `listfile` is the name of a JSON file that contains the list of specs
 * to crawl, `crawl folder` is the name of the folder where the crawl report
 * will be created, and `option` is an optional parameter that can be set to
 * `tr` to tell the crawler to crawl the published version of W3C specifications
 * instead of the Editor's Draft.
 *
 * The JSON file that contains the list of specs to crawl must be an array whose
 * individual items are either:
 * 1. a string that gets interpreted as the URL or the shortname of the spec to
 * crawl. The spec must exist in w3c/browser-specs
 * 2. an object that follows the w3c/browser-specs model:
 * https://github.com/w3c/browser-specs#spec-object
 *
 * @module crawler
 */

const fs = require('fs');
const path = require('path');
const specs = require('browser-specs');
const webidlParser = require('./parse-webidl');
const cssDfnParser = require('../lib/css-grammar-parser');
const fetch = require('../lib/util').fetch;
const requireFromWorkingDirectory = require('../lib/util').requireFromWorkingDirectory;
const completeWithAlternativeUrls = require('../lib/util').completeWithAlternativeUrls;
const isLatestLevelThatPasses = require('../lib/util').isLatestLevelThatPasses;
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
 * Load and parse the given spec.
 *
 * @function
 * @param {Object} spec The spec to load (must already have been completed with
 *   useful info, as returned by "createInitialSpecDescriptions")
 * @param {Object} crawlOptions Crawl options
 * @return {Promise<Object>} The promise to get a spec object with crawl info
 */
async function crawlSpec(spec, crawlOptions) {
    spec.crawled = crawlOptions.publishedVersion ?
        (spec.release ? spec.release.url : spec.nightly.url) :
        spec.nightly.url;
    spec.date = "";
    spec.links = {};
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
                generator: window.reffy.getGenerator(),
                date: window.reffy.getLastModifiedDate(),
                links: window.reffy.extractLinks(),
                dfns: window.reffy.extractDefinitions(),
                refs: window.reffy.extractReferences(),
                idl: window.reffy.extractWebIdl(),
                css: window.reffy.extractCSS()
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
        spec.generator = result.generator;
        spec.date = result.date;
        spec.links = result.links;
        spec.refs = result.refs;
        spec.idl = result.idl;
        spec.css = result.css;
        spec.dfns = result.dfns;
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

    const list = speclist.map(completeWithAlternativeUrls);
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
 * @param {Object} crawlOptions Crawl options
 * @param {Array(Object)} data The list of specification structures to save
 * @param {String} folder The path to the report folder
 * @return {Promise<void>} The promise to have saved the data
 */
async function saveResults(crawlOptions, data, folder) {
    async function getSubfolder(name) {
        let subfolder = path.join(folder, name);
        try {
            await fs.promises.mkdir(subfolder);
        }
        catch (err) {
            if (err.code !== 'EEXIST') {
                throw err;
            }
        }
        return subfolder;
    }
    const idlFolder = await getSubfolder('idl');
    const cssFolder = await getSubfolder('css');
    const dfnsFolder = await getSubfolder('dfns');

    async function saveIdl(spec) {
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
        try {
            await fs.promises.writeFile(
                path.join(idlFolder, spec.series.shortname + '.idl'), idl);
        }
        catch (err) {
            console.log(err);
        }
    };

    async function saveCss(spec) {
        // There are no comments in JSON, so include the spec title+URL as the
        // first property instead.
        const css = Object.assign({
            spec: {
                title: spec.title,
                url: spec.crawled
            }
        }, spec.css);
        const json = JSON.stringify(css, (key, val) => {
            if ((key === 'parsedValue') || (key === 'valueParseError')) {
                return undefined;
            }
            else {
                return val;
            }
        }, 2) + '\n';
        try {
            await fs.promises.writeFile(
                path.join(cssFolder, spec.series.shortname + '.json'), json);
        }
        catch (err) {
            console.log(err);
        }
    };

    async function saveDfns(spec) {
        const dfns = {
            spec: {
                title: spec.title,
                url: spec.crawled
            },
            dfns: spec.dfns
        };
        try {
            await fs.promises.writeFile(
                path.join(dfnsFolder, spec.shortname + '.json'),
                JSON.stringify(dfns, null, 2));
        }
        catch (err) {
            console.log(err);
        }
    }

    // Save IDL dumps for the latest level of a spec to the idl folder
    function defineIDLContent(spec) {
        return spec.idl && spec.idl.idl;
    }
    await Promise.all(data
        .filter(spec => isLatestLevelThatPasses(spec, data, defineIDLContent))
        .map(saveIdl));

    // Save CSS dumps for the latest level of a spec to the css folder
    function defineCSSContent(spec) {
        return spec.css && (
            (Object.keys(spec.css.properties || {}).length > 0) ||
            (Object.keys(spec.css.descriptors || {}).length > 0) ||
            (Object.keys(spec.css.valuespaces || {}).length > 0));
    }
    await Promise.all(data
        .filter(spec => isLatestLevelThatPasses(spec, data, defineCSSContent))
        .map(saveCss));

    // Save definitions for all specs
    await Promise.all(data
        .filter(spec => spec.dfns && spec.dfns.length > 0)
        .map(saveDfns));

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
            filedata.title = 'Reffy crawl';
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


/**
 * Crawls the specifications listed in the given JSON file and generates a
 * crawl report in the given folder.
 *
 * @function
 * @param {String} resultsPath Folder that is to contain the crawl report
 * @param {Object} options Crawl options
 * @return {Promise<void>} The promise that the crawl will have been made
 */
function crawlSpecs(resultsPath, options) {
    if (!resultsPath) {
        return Promise.reject('Required folder parameter missing');
    }
    try {
        fs.writeFileSync(path.join(resultsPath, 'crawl.json'), '');
    } catch (err) {
        return Promise.reject('Impossible to write to ' + resultsPath + ': ' + err);
    }

    function prepareListOfSpecs(list) {
        return list
            .map(spec => (typeof spec === 'string') ?
                specs.find(s => s.url === spec || s.shortname === spec) :
                spec)
            .filter(spec => !!spec);
    }

    const requestedList = (options && options.specFile) ?
        prepareListOfSpecs(requireFromWorkingDirectory(options.specFile)) :
        specs;

    return crawlList(requestedList, options, resultsPath)
        .then(results => saveResults(options, results, resultsPath));
}


/**************************************************
Export methods for use as module
**************************************************/
module.exports.crawlList = crawlList;
module.exports.crawlSpecs = crawlSpecs;


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
    var resultsPath = (process.argv[2] && process.argv[2].endsWith('.json')) ?
            process.argv[3] : process.argv[2];
    var crawlOptions = {
        specFile: process.argv.find(arg => arg.endsWith('.json')),
        publishedVersion: !!process.argv.find(arg => arg === 'tr'),
        debug: !!process.argv.find(arg => arg === 'debug')
    };

    // Process the file and crawl specifications it contains
    crawlSpecs(resultsPath, crawlOptions)
        .then(data => {
            console.log('finished');
            process.exit(0);
        })
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}
