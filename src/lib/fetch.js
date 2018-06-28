/**
 * Wrapper around the fetch module to setup a few config parameters from
 * config.json
 *
 * @module finder
 */

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


// The fetch-filecache-for-crawling library uses a file cache and is not
// thread-safe, so if the process runs as a child process, we'll process all
// fetch requests within the parent process, using message passing between the
// parent and child processes.
// 
// This is to avoid situations where multiple processes update the same file in
// the cache at once, in turn to guarantee that a process will never read a
// truncated file.
//
// NB: The counterpart of this code that handles exchanges from a parent
// perspective is in crawl-specs.js.
// NB: A cleaner approach would be to make sure that the fetch library is
// thread-safe, e.g. using file locks instead of memory locks, but then file
// locks are also a pain to manage in practice...
let reqId = 0;
let pendingFetches = [];
if (process.send) {
    process.on('message', msg => {
        if (msg.type !== 'fetch') {
            return;
        }
        let pendingIdx = pendingFetches.findIndex(p => (p.reqId === msg.reqId));
        if (pendingIdx < 0) {
            return;
        }
        let pending = pendingFetches[pendingIdx];
        pendingFetches.splice(pendingIdx, 1);
        if (!pending) {
            return;
        }
        if (msg.err) {
            pending.reject(new Error(msg.err));
        }
        else {
            // Cache entry updated, we can now use it
            pending.resolve();
        }
    });
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
    options = Object.assign({}, options);
    ['cacheFolder', 'resetCache', 'cacheRefresh', 'logToConsole'].forEach(param => {
        let fetchParam = (param === 'cacheRefresh') ? 'refresh' : param;
        if (config[param] && !options.hasOwnProperty(fetchParam)) {
            options[fetchParam] = config[param];
        }
    });
    if (!options.refresh) {
        options.refresh = 'once';
    }

    if (process.send) {
        // Process runs as child process, so let's update the cache first
        // and then read the response from the cache without refreshing it.
        await new Promise((resolve, reject) => {
            pendingFetches.push({ reqId, url, options, resolve, reject });
            process.send({ cmd: 'fetch', reqId, url, options });
            reqId += 1;
        });
        options.refresh = 'never';
    }
    return baseFetch(url, options);
}


module.exports = fetch;