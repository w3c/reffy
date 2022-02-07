/**
 * Wrapper around the fetch module to setup a few config parameters from
 * config.json
 *
 * @module finder
 */

const os = require('os');
const path = require('path');
const baseFetch = require('fetch-filecache-for-crawling');

// Read configuration parameters from `config.json` file
let config = null;
try {
    config = require(path.resolve('config.json'));
}
catch (err) {
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
async function fetch(url, options) {
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


module.exports = fetch;
