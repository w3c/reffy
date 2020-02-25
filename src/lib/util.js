/**
 * A bunch of utility functions common to multiple scripts
 */

const fs = require('fs').promises;
const path = require('path');
const puppeteer = require('puppeteer');
const crypto = require('crypto');
const { AbortController } = require('abortcontroller-polyfill/dist/cjs-ponyfill');
const fetch = require('./fetch');
const specEquivalents = require('../specs/spec-equivalents.json');
const canonicalizeUrl = require('../../builds/canonicalize-url').canonicalizeUrl;


/**
 * Shortcut that returns a property extractor iterator
 */
const prop = p => x => x[p];


/**
 * Wrapper around the "require" function to require files relative to the
 * current working directory (CWD), instead of relative to the current JS
 * file.
 *
 * This is typically needed to be able to use "require" to load JSON config
 * files provided as command-line arguments.
 *
 * @function
 * @param {String} filename The path to the file to require
 * @return {Object} The result of requiring the file relative to the current
 *   working directory.
 */
function requireFromWorkingDirectory(filename) {
    return require(path.resolve(filename));
}


/**
 * Load and process the given specification.
 *
 * The method automatically exposes Reffy's library functions in a window.reffy
 * namespace (see src/browserlib/reffy.js) so that the callback function can
 * call them directly. Additional callback arguments that would need to be
 * passed to the browser context can be provided through the "args" parameter.
 *
 * A crawl will typically fetch and render hundreds of specs, triggering a lot
 * of network requests. Given that some of these requests (e.g. those on images)
 * are of no interest for the processing, that it is wasteful to fetch the same
 * resource again and again during a crawl, and that it is useful to have an
 * offline mode for debugging purpose, the method will intercept network
 * requests made by the browser, fail those that don't seem needed, and serve
 * requests on resources that have already been fetched from a local file cache
 * (the "cacheRefresh" setting in "config.json" allows to adjust this behavior).
 *
 * This triggers a few hiccups and needs for workarounds though:
 * - Puppeteer's page.setRequestInterception does not play nicely with workers
 * (which Respec typically uses) for the time being, so code uses the Chrome
 * DevTools Protocol (CDP) directly, see:
 * https://github.com/puppeteer/puppeteer/issues/4208
 * - Tampering with network requests means that the loaded page gets
 * automatically flagged as "non secure". That's mostly fine but means that
 * "window.crypto.subtle" is not available and Respec needs that to generate
 * hashes. The code re-creates that method manually.
 * - A few specs send HTTP requests that return "streams". This does not work
 * well with Puppeteer's "networkidle0" option (to detect when a spec is mostly
 * done loading), and that does not work with a file cache approach either.
 * These requests get intercepted.
 *
 * A couple of additional notes:
 * - Requests to CSS stylesheets are not intercepted because Respec dynamically
 * loads a few CSS resources, and intercepting them could perhaps impact the
 * rest of the generation.
 * - SVG images are not intercepted because a couple of specs have a PNG
 * fallback mechanism that, when interception is on, make the browser spin
 * forever, see discussion in: https://github.com/w3c/accelerometer/pull/55
 *
 * Strictly speaking, intercepting request is only needed to be able to use the
 * "networkidle0" option. The whole interception logic could be dropped (and
 * "networkidle2" could be used instead) if it proves too unstable.
 *
 * @function
 * @public
 * @param {Object|String} spec The spec to load. Must either be a URL string or
 *   an object with a "url" property. If the object contains an "html" property,
 *   the HTML content is loaded instead.
 * @param {function} callback Processing function that will be evaluated in the
 *   browser context where the spec gets loaded
 * @param {Arrays} args List of arguments to pass to the callback function.
 * @param {Number} counter Counter used to detect infinite loops in cases where
 *   the first URL leads to another
 * @return {Promise} The promise to get the results of the processing function
 */
async function processSpecification(spec, callback, args, counter) {
    spec = (typeof spec === 'string') ? { url: spec } : spec;
    callback = callback || function () {};
    args = args || [];
    counter = counter || 0;
    if (counter >= 5) {
        throw new Error('Infinite loop detected');
    }

    // Create browser instance (one per specification. Switch "headless" to
    // "false" (and commenting out the call to "browser.close()") is typically
    // useful when something goes wrong to access dev tools and debug)
    const browser = await puppeteer.launch({ headless: true });

    // Create an abort controller for network requests directly handled by the
    // Node.js code (and not by Puppeteer)
    const abortController = new AbortController();

    // Inner function that returns a network interception method suitable for
    // a given CDP session.
    function interceptRequest(cdp) {
        return async function ({ requestId, request }) {
            try {
                if ((request.method !== 'GET') ||
                    (!request.url.startsWith('http:') && !request.url.startsWith('https:'))) {
                    await cdp.send('Fetch.continueRequest', { requestId });
                    return;
                }

                // Abort network requests to common image formats
                if (/\.(gif|ico|jpg|jpeg|png)$/i.test(request.url)) {
                    await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Failed' });
                    return;
                }

                // Abort network requests that return a "stream", they won't
                // play well with Puppeteer's "networkidle0" option, and our
                // custom "fetch" function does not handle streams in any case
                if (request.url.startsWith('https://drafts.csswg.org/api/drafts/') ||
                    request.url.startsWith('https://drafts.css-houdini.org/api/drafts/') ||
                    request.url.startsWith('https://drafts.fxtf.org/api/drafts/') ||
                    request.url.startsWith('https://api.csswg.org/shepherd/')) {
                    await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Failed' });
                    return;
                }

                // console.log(`intercept ${request.url}`);
                let response = await fetch(request.url, { signal: abortController.signal });
                let body = await response.buffer();

                // console.log(`intercept ${request.url} - done`);
                await cdp.send('Fetch.fulfillRequest', {
                    requestId,
                    responseCode: response.status,
                    responseHeaders: Object.keys(response.headers.raw()).map(header => {
                        return {
                            name: header,
                            value: response.headers.raw()[header].join(',')
                        };
                    }),
                    body: body.toString('base64')
                });
            }
            catch (err) {
                if (abortController.signal.aborted) {
                    // All is normal, processing was over, page and CDP session
                    // have been closed, and network requests have been aborted
                    // console.log(`intercept ${request.url} - aborted`);
                    return;
                }

                // Fetch from file cache failed somehow, report a warning
                // and let Puppeteer handle the request as fallback
                console.warn(`Fall back to regular network request for ${request.url}`, err);
                try {
                    await cdp.send('Fetch.continueRequest', { requestId });
                }
                catch (err) {
                    if (!abortController.signal.aborted) {
                        console.warn(`Fall back to regular network request for ${request.url} failed`, err);
                    }
                }
            }
        }
    }

    try {
        const page = await browser.newPage();

        // Intercept all network requests to use our own version of "fetch"
        // that makes use of the local file cache.
        const cdp = await page.target().createCDPSession();
        await cdp.send('Fetch.enable');
        cdp.on('Fetch.requestPaused', interceptRequest(cdp));

        // Quick and dirty workaround to re-create the "window.crypto.digest"
        // function that Respec needs (context is seen as unsecure because we're
        // tampering with network requests)
        await page.exposeFunction('hashdigest', (algorithm, buffer) => {
            return crypto.createHash(algorithm).update(Buffer.from(Object.values(buffer))).digest();
        });
        await page.evaluateOnNewDocument(() => {
            window.crypto.subtle = {
                digest: function (algorithm, buffer) {
                    const res = window.hashdigest('sha1', buffer);
                    return res.then(buf => {
                        return Uint8Array.from(buf.data);
                    });
                }
            };
        });

        // Common loading option to give the browser enough time to load large
        // specs, and to consider navigation done when there haven't been
        // network connections in the past 500ms. This should be enough to
        // handle "redirection" through JS or meta refresh (which would not
        // have time to run if we used "load").
        const options = {
            timeout: 60000,
            waitUntil: 'networkidle0'
        };

        // Load the page
        if (spec.html) {
            await page.setContent(spec.html, options);
        }
        else {
            await page.goto(spec.url, options);
        }

        // If the spec is a multi-page spec and contains a "Single page" link,
        // extract the URL of the single page and load it instead
        const singlePageUrl = await page.$$eval('body .head dl a[href]', links => {
            const link = links.find(link => {
                const text = (link.textContent || '').toLowerCase();
                return text.includes('single page') ||
                    text.includes('single file') ||
                    text.includes('single-page') ||
                    text.includes('one-page');
            });
            if (link) {
                const url = new URL(link.getAttribute('href'), document.baseURI);
                return url.href;
            }
            else {
                return null;
            }
        });
        if (singlePageUrl && (singlePageUrl !== spec.url) && (singlePageUrl !== page.url())) {
            return processSpecification(singlePageUrl, callback, args, counter + 1);
        }

        // Handle remaining multi-page specs manually, merging all subpages
        // into the main page to create a single-page spec.
        let multiPagesRules = {
            'https://www.w3.org/TR/CSS2/': '.quick.toc .tocxref',
            'https://www.w3.org/TR/CSS22/': '#toc .tocxref',
            'https://drafts.csswg.org/css2/': '.quick.toc .tocxref'
        };
        if (multiPagesRules[page.url()]) {
            let urls = await page.$$eval(multiPagesRules[page.url()], links =>
                links.map(link => (new URL(link.getAttribute('href'), link.ownerDocument.baseURI)).toString()));
            const pages = [];
            for (const url of urls) {
                const subPage = await browser.newPage();
                const subCdp = await page.target().createCDPSession();
                await subCdp.send('Fetch.enable');
                subCdp.on('Fetch.requestPaused', interceptRequest(subCdp));
                await subPage.goto(url, options);
                const html = await subPage.evaluate(() => { return document.body.innerHTML; });
                await subCdp.detach();
                await subPage.close();
                pages.push(html);
            }
            await page.evaluate(pages => {
                for (const html of pages) {
                    const section = document.createElement('section');
                    section.innerHTML = html;
                    document.body.appendChild(section);
                }
            }, pages);
        }

        // Wait until the generation of the spec is completely over
        await page.evaluate(async () => {
            const usesRespec = (window.respecConfig || window.eval('typeof respecConfig !== "undefined"')) &&
                window.document.head.querySelector("script[src*='respec']");

            function sleep(ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
            }

            async function isReady(counter) {
                counter = counter || 0;
                if (counter > 60) {
                    throw new Error('Respec generation took too long');
                }
                if (window.document.respecIsReady) {
                    await window.document.respecIsReady;
                }
                else if (usesRespec) {
                    await sleep(1000);
                    await isReady();
                }
            }

            await isReady();
        });


        // Expose additional functions defined in src/browserlib/ to the
        // browser context, under a window.reffy namespace, so that processing
        // script may call them
        await page.addScriptTag({
            path: path.resolve(__dirname, '../../builds/browser.js')
        });

        // Run the callback method in the browser context
        const results = await page.evaluate(callback, ...args);

        // Close CDP session and page
        // Note that gets done no matter what when browser.close() gets called.
        await cdp.detach();
        await page.close();

        return results;
    }
    finally {
        // Pending network requests may still be in the queue, flag the page
        // as closed not to send commands on a CDP session that's no longer
        // attached to anything
        abortController.abort();

        // Kill the browser instance
        await browser.close();
    }
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
 * @param {String} key W3C Api key to use (note the function may be passed as
 *   argument to a `map` call. When that happens, the second parameter is the
 *   index of the element in the array (and gets ignored)
 * @return {Promise<Object>} The same structure, enriched with the URL of the editor's
 *   draft when one is found
 */
function completeWithInfoFromW3CApi(spec, key) {
    var shortname = spec.shortname;
    key = (key && (typeof spec === 'string')) ?
        key :
        requireFromWorkingDirectory('config.json').w3cApiKey;
    var options = {
        headers: {
            Authorization: 'W3C-API apikey="' + key + '"'
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
            const versions = s._embedded['version-history'].map(prop("uri")).map(canonicalizeUrl);
            const editors = s._embedded['version-history'].map(prop("editor-draft")).filter(u => !!u).map(canonicalizeUrl);
            const latestVersion = s._embedded['version-history'][0];
            spec.title = latestVersion.title;
            if (!spec.latest) spec.latest = latestVersion.shortlink;
            if (latestVersion.uri) {
                spec.datedUrl = latestVersion.uri;
                spec.datedStatus = latestVersion.status;
            }
            spec.informative =
                !latestVersion['rec-track'] || latestVersion.informative;
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
 * Get the "shortname" identifier for a specification.
 *
 * @function
 * @private
 * @param {Object} spec The specification object with a `url` key and optionally
 *   a `shortname` key previously extracted by `completeWithShortName`.
 * @return {String} a short identifier suitable for use in URLs and filenames.
 */
function getShortname(spec) {
    if (spec.shortname) {
        // do not include versionning, see also:
        // https://github.com/foolip/day-to-day/blob/d336df7d08d57204a68877ec51866992ea78e7a2/build/specs.js#L176
        if (spec.shortname.startsWith('css3')) {
            if (spec.shortname === 'css3-background') {
                return 'css-backgrounds'; // plural
            }
            else {
                return spec.shortname.replace('css3', 'css');
            }
        }
        else {
            return spec.shortname.replace(/-?[\d\.]*$/, '');
        }
    }
    const whatwgMatch = spec.url.match(/\/\/(.*)\.spec\.whatwg\.org\/$/);
    if (whatwgMatch) {
        return whatwgMatch[1];
    }
    const khronosMatch = spec.url.match(/https:\/\/www\.khronos\.org\/registry\/webgl\/specs\/latest\/([12])\.0\/$/);
    if (khronosMatch) {
        return "webgl" + khronosMatch[1];
    }
    const extensionMatch = spec.url.match(/\/.*\.github\.io\/([^\/]*)\/(extensions?)\.html$/);
    if (extensionMatch) {
        return extensionMatch[1] + '-' + extensionMatch[2];
    }
    const githubMatch = spec.url.match(/\/.*\.github\.io\/(?:webappsec-)?([^\/]+)\//);
    if (githubMatch) {
        if (githubMatch[1] === 'ServiceWorker') {
            // Exception to the rule for service workers ED
            return 'service-workers';
        }
        else {
            return githubMatch[1];
        }
    }
    const cssDraftMatch = spec.url.match(/\/drafts\.(?:csswg|fxtf|css-houdini)\.org\/([^\/]*)\//);
    if (cssDraftMatch) {
        return cssDraftMatch[1].replace(/-[\d\.]*$/, '');
    }
    const svgDraftMatch = spec.url.match(/\/svgwg\.org\/svg2-draft\//);
    if (svgDraftMatch) {
        return 'SVG';
    }
    const svgSpecMatch = spec.url.match(/\/svgwg\.org\/specs\/([^\/]+)\//);
    if (svgSpecMatch) {
        return 'svg-' + svgSpecMatch[1];
    }
    return spec.url.replace(/[^-a-z0-9]/g, '');
}


module.exports = {
    fetch,
    requireFromWorkingDirectory,
    processSpecification,
    completeWithShortName,
    completeWithInfoFromW3CApi,
    getShortname
};
