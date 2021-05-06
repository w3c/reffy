#!/usr/bin/env node
/**
 * The spec crawler takes a list of spec URLs as input, gathers some knowledge
 * about these specs (published versions, URL of the Editor's Draft, etc.),
 * fetches these specs, and runs a processor function on them.
 *
 * @module crawler
 */

const fs = require('fs');
const path = require('path');
const { setupBrowser, teardownBrowser } = require('../lib/util');


/**
 * Main method that crawls the list of specification URLs and return a structure
 * built by the specProcessor function
 *
 * @function
 * @param {Array(String)} speclist List of URLs to parse
 * @param {Function} a Promise return function which returns data from a spec
 * @param {Object} crawlOptions Crawl options
 * @return {Promise<Array(Object)} The promise to get an array of complete
 *   specification extractions
 */
async function crawlSpecs(speclist, specProcessor, crawlOptions) {
    crawlOptions = crawlOptions || {};

    // Prepare Puppeteer instance
    await setupBrowser();

    const listAndPromise = speclist.map(spec => {
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
    const chunkSize = Math.min((crawlOptions.debug ? 1 : 4), speclist.length);

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
        const result = await specProcessor(spec, crawlOptions);
        console.log(`${logCounter} - ${spec.url} - done`);
        flagNextSpecAsReadyToCrawl();
        return result;
    }

    const results = await Promise.all(listAndPromise.map(crawlSpecAndPromise));

    // Close Puppeteer instance
    teardownBrowser();

    return results;
}


/**************************************************
Export methods for use as module
**************************************************/
module.exports.crawlSpecs = crawlSpecs;
