const fs = require('fs');
const URL = require('url');
const { JSDOM } = require('jsdom');
const filenamify = require('filenamify-url');
const baseFetch = require('node-fetch');
const Response = require('node-fetch').Response;
const rimraf = require('rimraf');
const respecWriter = require("respec/tools/respecDocWriter").fetchAndWrite;
var config = null;
try {
    config = require('./config.json');
}
catch (e) {
    config = {};
};


// The list of URLs that are being fetched and that should soon
// be available from the cache, together with the Promise to have
// fetched them
const pendingFetches = {};

// The list of URLs that have been fetched (and that exist in the cache)
// during this crawl. Used as a basic "max-age" mechanism to avoid sending
// multiple requests to the same URL per crawl
const fetchedUrls = [];

// Reset the cache folder only once
var cacheFolderReset = false;


/**
 * Wrapper around the baseFetch function that returns the response from the
 * local cache if one is found.
 *
 * TODO: use encoding specified in content-type header for file operations?
 *
 * @function
 * @private
 * @param {String} url The URL to retrieve
 * @param {Object} options Fetch options, include specific HTTP headers to
 *   send along with the request.
 * @return {Promise<Response>} The promise to get an HTTP response
 */
function fetch(url, options) {
    const cacheFilename = 'cache/' + filenamify(url);
    const cacheHeadersFilename = cacheFilename + '.headers';
    options = options || {};

    if (!cacheFolderReset) {
        cacheFolderReset = true;
        if (config.resetCache) {
            // NB: using "sync" versions to avoid having to deal with
            // parallel requests that could start using the contents of
            // the cache before it has been fully reset.
            rimraf.sync('cache/*');
        }
    }

    function checkCacheFolder() {
        return new Promise((resolve, reject) => {
            fs.stat('cache', (err, stat) => {
                if (err && (err.code === 'ENOENT')) {
                    fs.mkdir('cache', err => {
                        if (err && err.code === 'EEXIST') {
                            // Someone created the folder in the meantime
                            resolve();
                        }
                        else if (err) {
                            reject(err);
                        }
                        else {
                            resolve();
                        }
                    });
                }
                else if (err) {
                    reject(err);
                }
                else if (stat.isDirectory()) {
                    resolve();
                }
                else {
                    reject(new Error('Looking for a "cache" folder but found a "cache" file instead'));
                }
            });
        });
    }

    function checkPendingFetch() {
        if (pendingFetches[url]) {
            return pendingFetches[url];
        }
        else {
            return Promise.resolve();
        }
    }

    function addPendingFetch(url, promise) {
        pendingFetches[url] = promise;
    }

    function readHeadersFromCache() {
        return new Promise((resolve, reject) => {
            fs.readFile(cacheHeadersFilename, 'utf8', function (err, data) {
                var headers = null;
                if (!err) {
                    try {
                        headers = JSON.parse(data);
                    }
                    catch (e) {
                    }
                }
                resolve(headers);
            });
        });
    }

    function readFromCache() {
        return new Promise((resolve, reject) => {
            fs.readFile(cacheHeadersFilename, 'utf8', function (err, data) {
                if (err) {
                    return reject(err);
                }
                var headers = null;
                try {
                    headers = JSON.parse(data);
                }
                catch (e) {
                    return reject(e);
                }
                resolve(headers);
            });
        }).then(headers => new Promise((resolve, reject) => {
            fs.readFile(cacheFilename, 'utf8', function (err, data) {
                if (err) {
                    return reject(err);
                }
                resolve(new Response(data, {
                    url,
                    status: 200,
                    headers
                }));
            });
        }));
    }

    function saveToCacheIfNeeded(response) {
        function saveHeaders() {
            return new Promise((resolve, reject) => {
                const headers = {};
                response.headers.forEach((value, header) => headers[header] = value);
                fs.writeFile(
                    cacheHeadersFilename,
                    JSON.stringify(headers, null, 2),
                    'utf8',
                    err => (err ? reject(err) : resolve()));
            });
        }

        function saveBody() {
            return response.text()
                .then(data => new Promise((resolve, reject) => {
                    fs.writeFile(cacheFilename, data, 'utf8',
                        err => (err ? reject(err) : resolve()));
                }));
        }

        if (response.status === 304) {
            // Response is the one we have in cache
            return;
        }
        else {
            return saveHeaders().then(saveBody);
        }
    }

    function conditionalFetch(prevHeaders) {
        if ((prevHeaders && config.avoidNetworkRequests) || fetchedUrls[url]) {
            if (!options.nolog) console.log('Fetch (from cache): ' + url);
            return readFromCache();
        }

        options.headers = options.headers || {};
        if (prevHeaders && prevHeaders['last-modified']) {
            options.headers['If-Modified-Since'] = prevHeaders['last-modified'];
        }
        if (prevHeaders && prevHeaders.etag) {
            options.headers['If-None-Match'] = prevHeaders.etag;
        }

        if (options.headers['If-Modified-Since'] ||
            options.headers['If-None-Match']) {
            if (!options.nolog) console.log('Fetch (conditional request): ' + url);
        }
        else {
            if (!options.nolog) console.log('Fetch: ' + url);
        }

        // To overcome transient network errors, we'll fetch the same URL again
        // a few times before we surrender when a network error occurs, letting
        // a few seconds elapse between attempts
        function fetchWithRetry(url, options, remainingAttempts) {
            return (remainingAttempts <= 0) ?
                baseFetch(url, options) :
                baseFetch(url, options).catch(err => {
                    if (!options.nolog) console.warn('Fetch attempt failed: ' + url);
                    return new Promise((resolve, reject) => {
                        setTimeout(function () {
                            fetchWithRetry(url, options, remainingAttempts - 1)
                                .then(resolve)
                                .catch(reject);
                        }, 2000 + Math.floor(Math.random() * 8000));
                    });
                });
        }

        return fetchWithRetry(url, options, 3)
            .then(saveToCacheIfNeeded)
            .then(readFromCache);
    }

    return checkCacheFolder()
        .then(checkPendingFetch)
        .then(pendingFetch => {
            if (!pendingFetch) {
                pendingFetch = readHeadersFromCache()
                    .then(conditionalFetch)
                    .then(response => {
                        delete pendingFetches[url];
                        fetchedUrls[url] = true;
                        return response;
                    });
                addPendingFetch(url, pendingFetch);
            }
            return pendingFetch;
        });
}


/**
 * Load the given specification.
 *
 * @function
 * @public
 * @param {String} url The URL of the specification to load
 * @param {Number} counter Optional loop counter parameter to detect infinite
 *   loop. The parameter is mostly meant to be an internal parameter, set and
 *   incremented between calls when dealing with redirections. There should be
 *   no need to set that parameter when calling that function externally.
 * @return {Promise} The promise to get a window object once the spec has
 *   been loaded with jsdom.
 */
function loadSpecification(url, counter) {
    counter = counter || 0;
    if (counter >= 5) {
        return new Promise((resolve, reject) => {
            reject(new Error('Infinite loop detected'));
        });
    }
    return fetch(url).then(response => new Promise((resolve, reject) => {
        response.text().then(html => {
            // Drop Byte-Order-Mark character if needed, it bugs JSDOM
            if (html.charCodeAt(0) === 0xFEFF) {
                html = html.substring(1);
            }
            const {window} = new JSDOM(html, {url: response.url});
            const doc = window.document;

            // Handle <meta http-equiv="refresh"> redirection
            // Note that we'll assume that the number in "content" is correct
            let metaRefresh = doc.querySelector('meta[http-equiv="refresh"]');
            if (metaRefresh) {
                let redirectUrl = (metaRefresh.getAttribute('content') || '').split(';')[1];
                if (redirectUrl) {
                    redirectUrl = URL.resolve(doc.baseURI, redirectUrl.trim());
                    if (redirectUrl !== url) {
                        loadSpecification(redirectUrl, counter + 1)
                            .then(window => resolve(window))
                            .catch(err => reject(err));
                        return;
                    }
                }
            }

            // ReSpec doc
            if (doc.querySelector("script[src*='respec']")) {
                // this does another network fetch :(
                return respecWriter(url, '', {}, 20000).then(function(html) {
                    const dom = new JSDOM(html, {url: response.url});
                    resolve(dom.window);
                }).catch(reject);
            } else { // ReSpec doesn't do multipages in any case
                const links = doc.querySelectorAll('body .head dl a[href]');
                for (let i = 0 ; i < links.length; i++) {
                    let link = links[i];
                    let text = (link.textContent || '').toLowerCase();
                    if (text.includes('single page') ||
                        text.includes('single file') ||
                        text.includes('single-page') ||
                        text.includes('one-page')) {
                        let singlePage = URL.resolve(doc.baseURI, link.getAttribute('href'));
                        if (singlePage === url) {
                            // We're already looking at the single page version
                            resolve(window);
                        }
                        else {
                            loadSpecification(singlePage)
                                .then(window => resolve(window))
                                .catch(err => reject(err));
                        }
                        return;
                    }
                }
            }
            resolve(window);
        });
    }));
}

function urlOrDom(input) {
    if (typeof input === "string") {
        return loadSpecification(input);
    } else {
        return new Promise((res, rej) =>  res(input));
    }
}

/**
 * Given a "window" object loaded with jsdom, retrieve the document along
 * with the name of the well-known generator that was used, if known.
 *
 * Note that the function only returns when the document is properly generated
 * (typically, once ReSpec is done generating the document if the spec being
 * considered is a raw ReSpec document)
 *
 * @function
 * @public
 * @param {Window} window
 * @return {Promise} The promise to get a document ready for extraction and
 *   the name of the generator (or null if generator is unknown).
 */
function getDocumentAndGenerator(window) {
    return new Promise(function (resolve, reject) {
        var doc = window.document;
        var generator = window.document.querySelector("meta[name='generator']");
        var timeout = null;
        if (generator && generator.content.match(/bikeshed/i)) {
            resolve({doc, generator:'bikeshed'});
        } else if (doc.body.id === "respecDocument") {
            resolve({doc, generator:'respec'});
        } else if (window.respecConfig &&
            window.document.head.querySelector("script[src*='respec']")) {
            if (!window.respecConfig.postProcess) {
                window.respecConfig.postProcess = [];
            }
            window.respecConfig.postProcess.push(function() {
                if (timeout) {
                    clearTimeout(timeout);
                }
                resolve({doc, generator: 'respec'});
            });
            timeout = setTimeout(function () {
              reject(new Error('Specification apparently uses ReSpec but document generation timed out'));
            }, 30000);
        } else if (doc.getElementById('anolis-references')) {
            resolve({doc, generator: 'anolis'});
        } else {
            resolve({doc});
        }
    });
}

module.exports.loadSpecification = loadSpecification;
module.exports.urlOrDom = urlOrDom;
module.exports.getDocumentAndGenerator = getDocumentAndGenerator;
module.exports.fetch = fetch;
