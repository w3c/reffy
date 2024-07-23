/**
 * Wrapper around the fetch module to setup a few config parameters from
 * config.json
 *
 * @module finder
 */

import os from 'node:os';
import { cwd } from 'node:process';
import path from 'node:path';
import baseFetch from 'fetch-filecache-for-crawling';
import { loadJSON } from './util.js';

// Read configuration parameters from `config.json` file
let config = await loadJSON('config.json');
if (!config) {
    config = {};
}


/**
 * Fetch function that applies fetch parameters defined in `config.json`
 * unless parameters are already set.
 *
 * By default, force the HTTP refresh strategy to "once", so that only one
 * HTTP request gets sent on a given URL per crawl.
 *
 * @function
 * @param {String} url URL to fetch
 * @param {Object} options Fetch options (and options for node-fetch, and
 *   options for fetch-filecache-for-crawling)
 * @return {Promise(Response)} Promise to get an HTTP response
 */
export default async function fetch(url, options) {
    options = Object.assign({headers: {}}, options);
    ['cacheFolder', 'resetCache', 'cacheRefresh', 'logToConsole'].forEach(param => {
        let fetchParam = (param === 'cacheRefresh') ? 'refresh' : param;
        if (config[param] && !options.hasOwnProperty(fetchParam)) {
            options[fetchParam] = config[param];
        }
    });
    if (!options.refresh) {
        options.refresh = 'once';
    }

    // Use cache folder in tmp folder by default
    if (!options.cacheFolder) {
        options.cacheFolder = path.resolve(os.tmpdir(), 'reffy-cache');
    }

    return baseFetch(url, options);
}
