/**
 * A bunch of utility functions common to multiple scripts
 */

const fs = require('fs').promises;
const { existsSync } = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const crypto = require('crypto');
const { AbortController } = require('abortcontroller-polyfill/dist/cjs-ponyfill');
const fetch = require('./fetch');
const specEquivalents = require('../specs/spec-equivalents.json');

const reffyModules = require('../browserlib/reffy.json');

/**
 * Maximum depth difference supported between Reffy's install path and custom
 * modules that may be provided on the command-line
 *
 * TODO: Find a way to get right of that, there should be no limit
 */
const maxPathDepth = 20;

/**
 * Returns a range array from 0 to the number provided (not included)
 */
const range = n => Array.from(Array(n).keys());


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
    try {
        return require(path.resolve(filename));
    }
    catch (err) {
        return null;
    }
}


/**
 * Determine the path to the "node_modules" folder to resolve relative links
 * in the ES6 browser lib modules. The path depends on whether Reffy is run
 * directly, or installed as a library.
 *
 * @function
 * @return {String} Path to the node_modules folder.
 */
function getModulesFolder() {
    const rootFolder = path.resolve(__dirname, '../..');
    let folder = path.resolve(rootFolder, 'node_modules');
    if (existsSync(folder)) {
        return folder;
    }
    folder = path.resolve(rootFolder, '..');
    return folder;
}
const modulesFolder = getModulesFolder();


/**
 * Puppeteer browser instance used to load and process specifications
 */
let browser = null;

/**
 * Promise resolved when there is no running instance of Puppeteer. This allows
 * to serialize calls to setupBrowser (and thus to crawlList and crawlSpecs in
 * specs-crawler.js)
 */
let browserClosed = Promise.resolve();
let resolveBrowserClosed = null;

/**
 * The browser JS library that will be loaded onto every crawled page
 */
let browserlib = null;


/**
 * Expand list of browser modules with right set of descriptive properties
 * 
 * User may specify a browser module as:
 * - a name which must match one of the existing modules in browserlib
 * - a relative path to an .mjs file which must exist
 * - an object with an "href" property that is a relative path to an .mjs file
 * which must exist
 * 
 * Relative paths provided by the user are interpreted as relative to the
 * current working directory, and converted to be relative to the browserlib
 * directory.
 * 
 * @function
 * @public
 * @return {Array(Object)} List of modules with an href, name and property keys
 */
function expandBrowserModules(modules) {
    // Helper function to create a camelCase name out of a module path
    function getCamelCaseName(href) {
        const filename = href.replace(/([^\/\\]+)\.mjs$/, '$1');
        const nameParts = filename.split('-');
        let name;
        let namePart;
        while (namePart = nameParts.shift()) {
            namePart = namePart.replace(/\W/g, '');
            if (name) {
                name += namePart.substring(0, 1).toUpperCase() + namePart.substring(1);
            }
            else {
                name = namePart;
            }
        }
        return name;
    }

    const browserlibPath = path.resolve(__dirname, '..', 'browserlib');
    if (!modules) {
        return reffyModules.map(mod => Object.assign({
            name: getCamelCaseName(mod.href),
            expanded: true
        }, mod));
    }

    modules = modules.map(mod => {
        if (typeof mod === 'string') {
            if (mod.endsWith('.mjs')) {
                const name = getCamelCaseName(mod);
                return {
                    href: path.relative(browserlibPath, path.join(process.cwd(), mod)).replace(/\\/g, '/'),
                    name,
                    property: name,
                    expanded: true
                };
            }
            else if (mod === 'core') {
                return reffyModules.map(mod => Object.assign({
                    name: getCamelCaseName(mod.href),
                    expanded: true
                }, mod));
            }
            else {
                const res = reffyModules.find(m => m.href === mod ||
                    getCamelCaseName(m.href) === mod || m.property === mod);
                if (!res) {
                    throw new Error(`Unknown browserlib module ${mod}`);
                }
                return Object.assign({
                    name: getCamelCaseName(res.href),
                    expanded: true
                }, res);
            }
        }
        else if (mod.expanded) {
            return mod;
        }
        else {
            if (!mod.href) {
                throw new Error('Browserlib module does not have an "href" property');
            }
            mod.href = path.relative(browserlibPath, path.join(process.cwd(), mod.href)).replace(/\\/g, '/');
            if (!mod.name) {
                mod.name = getCamelCaseName(mod.href);
            }
            if (!mod.property) {
                mod.property = mod.name;
            }
            mod.expanded = true;
            return mod;
        }
    });

    return modules.flat();
}


/**
 * Prepare the browserlib script that will be loaded in every crawled page.
 * 
 * The script exposes a global reffy namespace with the requested modules.
 * 
 * The function must be called before any attempt to call `processSpecification`
 * and should only be called once. The `setupBrowser` function takes care of it.
 * 
 * @function
 * @private
 */
function setupBrowserlib(modules) {
    modules = expandBrowserModules(modules);
    browserlib = 'window.reffy = window.reffy ?? {};\n';

    if (modules.find(module => module.needsIdToHeadingMap)) {
        browserlib += `
import mapIdsToHeadings from './map-ids-to-headings.mjs';
window.reffy.mapIdsToHeadings = mapIdsToHeadings;\n`;
    }

    browserlib += modules.map(module => `
import ${module.name} from '${module.href}';
window.reffy.${module.name} = ${module.name};
`).join('\n');
}


/**
 * Setup and launch browser instance to use to load and process specifications.
 *
 * The function must be called before any attempt to call `processSpecification`
 * and should only be called once.
 *
 * The function also generates the code that will inject the `reffy` namespace
 * in each processed page.
 *
 * Note: Switch `headless` to `false` to access dev tools and debug processing
 *
 * @function
 * @public
 */
async function setupBrowser(modules) {
    // There can be only one crawl running at a time
    await browserClosed;
    browserClosed = new Promise(resolve => resolveBrowserClosed = resolve);

    // Create browser instance
    // Note: switch "headless" to "false" (and comment out the call to
    // "browser.close()") to access dev tools in debug mode
    browser = await puppeteer.launch({ headless: true });
    setupBrowserlib(modules);
}


/**
 * Close and destroy browser instance.
 *
 * The function should be called once at the end of the processing.
 *
 * @function
 * @public
 */
async function teardownBrowser() {
    if (browser) {
        await browser.close();
        browser = null;
        resolveBrowserClosed();
        resolveBrowserClosed = null;
    }
}


/**
 * Load and process the given specification.
 *
 * The method automatically exposes Reffy's library functions in a window.reffy
 * namespace (see setupBrowserlib) so that the callback function can
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
 * @param {function} processFunction Processing function that will be evaluated
 *   in the browser context where the spec gets loaded
 * @param {Arrays} args List of arguments to pass to the processing function.
 *   These arguments typically make it possible to pass contextual information
 *   to the processing function (such as the spec object that describes the
 *   spec being processed, or the list of processing modules to run)
 * @param {Object} options Processing options. The "quiet" flag tells the
 *   function not to report warnings to the console. The "forceLocalFetch"
 *   flag tells the function that all network requests need to be only handled
 *   by Node.js's "fetch" function (as opposed to falling back to Puppeteer's
 *   network and caching logic), which is useful to keep full control of network
 *   requests in tests. The "etag" and "lastModified" options give input
 *   to the conditional fetch request sent for the primary crawled URL
 * @return {Promise} The promise to get the results of the processing function
 */
async function processSpecification(spec, processFunction, args, options) {
    spec = (typeof spec === 'string') ? { url: spec } : spec;
    processFunction = processFunction || function () {};
    args = args || [];
    options = options || {};
    let prefetchedResponse = {};

    if (!browser) {
        throw new Error('Browser instance not initialized, setupBrowser() must be called before processSpecification().');
    }

    // Create an abort controller for network requests directly handled by the
    // Node.js code (and not by Puppeteer)
    const abortController = new AbortController();

    // Inner function that returns a network interception method suitable for
    // a given CDP session.
    function interceptRequest(cdp, controller) {
        return async function ({ requestId, request }) {
            try {
                // Abort network requests to common image formats
                if (/\.(gif|ico|jpg|jpeg|png|ttf|woff)$/i.test(request.url)) {
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

                // The request needs to be intercepted, either because it
                // targets one of the local script files, or because we would
                // like to use our local cache to avoid sending network requests
                // when possible.
                //console.log(`intercept ${request.url}`);
                const reffyPath = '/reffy/scripts/';
                const webidl2Path = '/node_modules/webidl2/';
                if (request.url.includes(reffyPath) || request.url.includes(webidl2Path)) {
                    let body;
                    if (request.url.endsWith('reffy.mjs')) {
                        body = Buffer.from(browserlib);
                    }
                    else if (request.url.includes(webidl2Path)) {
                        const file = path.resolve(modulesFolder, 'webidl2',
                            request.url.substring(request.url.indexOf(webidl2Path) + webidl2Path.length));
                        body = await fs.readFile(file);
                    }
                    else {
                        // The "__" folders are just a means to resolve
                        // relative paths that are higher than the "browserlib"
                        // folder on the storage drive
                        const requestPath = request.url.substring(request.url.indexOf(reffyPath) + reffyPath.length);
                        let depth = requestPath.lastIndexOf('__/') / 3;
                        const filename = requestPath.substring(requestPath.lastIndexOf('__/') + 3);
                        let filePath = path.resolve(__dirname, '..', 'browserlib');
                        while (depth < maxPathDepth - 1) {
                            filePath = path.resolve(filePath, '..');
                            depth += 1;
                        }
                        const file = path.resolve(filePath, filename);
                        body = await fs.readFile(file);
                    }
                    await cdp.send('Fetch.fulfillRequest', {
                        requestId,
                        responseCode: 200,
                        responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }],
                        body: body.toString('base64')
                    });
                }
                else {
                    if ((request.method !== 'GET') ||
                        (!request.url.startsWith('http:') && !request.url.startsWith('https:'))) {
                        await cdp.send('Fetch.continueRequest', { requestId });
                        return;
                    }
                    const response = prefetchedResponse[request.url] ?? await fetch(request.url, { signal: controller.signal, headers: request.headers });

                    const body = await response.buffer();

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
                //console.log(`intercept ${request.url} - done`);
            }
            catch (err) {
                if (controller.signal.aborted) {
                    // All is normal, processing was over, page and CDP session
                    // have been closed, and network requests have been aborted
                    // console.log(`intercept ${request.url} - aborted`);
                    return;
                }

                // Fetch from file cache failed somehow
                // Let Puppeteer handle the request as fallback unless
                // calling function asked us not to do that
                if (options.forceLocalFetch) {
                    options.quiet ?? console.warn(`[warn] Network request for ${request.url} failed`, err);
                    await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Failed' });
                }
                else {
                    try {
                        options.quiet ?? console.warn(`[warn] Fall back to regular network request for ${request.url}`, err);
                        await cdp.send('Fetch.continueRequest', { requestId });
                    }
                    catch (err) {
                        if (!controller.signal.aborted) {
                            options.quiet ?? console.warn(`[warn] Fall back to regular network request for ${request.url} failed`, err);
                        }
                    }
                }
            }
        }
    }

    try {
        // Fetch the spec URL if using https
        // This allow to skip launching a browser
        // if we have a fallback data source
        // with a defined cache target for the spec
        if (!spec.url.startsWith('file://')) {
          let response;
          // We set a conditional request header
          // Use If-Modified-Since in preference as it is in practice
          // more reliable for conditional requests
          let headers = {'Accept-Encoding': 'gzip, deflate, br', 'Upgrade-Insecure-Requests': 1, 'User-Agent': browser.userAgent()};
          if (options.lastModified) {
            headers["If-Modified-Since"] = options.lastModified;
          } else if (options.etag) {
            headers["If-None-Match"] = options.etag;
          }
          try {
            response = await fetch(spec.url, {headers});
            if (response.status === 304) {
              return {status: "notmodified"};
            }
            prefetchedResponse[spec.url] = response;
          } catch (err) {
            throw new Error(`Loading ${spec.url} triggered network error ${err}`);
          }
          if (response.status !== 200) {
            throw new Error(`Loading ${spec.url} triggered HTTP status ${response.status}`);
          }
        }
        const page = await browser.newPage();

        // Disable cache if caller wants to handle all network requests
        await page.setCacheEnabled(!options.forceLocalFetch);

        // Intercept all network requests to use our own version of "fetch"
        // that makes use of the local file cache.
        const cdp = await page.target().createCDPSession();
        await cdp.send('Fetch.enable');
        cdp.on('Fetch.requestPaused', interceptRequest(cdp, abortController));

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
        const loadOptions = {
            timeout: 120000,
            waitUntil: 'networkidle0'
        };

        // Load the page
        // (note HTTP status is 0 when `file://` URLs are loaded)
        let cacheInfo;
        if (spec.html) {
            await page.setContent(spec.html, loadOptions);
        }
        else {
            let result;
            try {
              result = await page.goto(spec.url, loadOptions);
            } catch (err) {
              throw new Error(`Loading ${spec.url} triggered network error ${err}`);
            }
            if ((result.status() !== 200) && (!spec.url.startsWith('file://') || (result.status() !== 0))) {
              throw new Error(`Loading ${spec.url} triggered HTTP status ${result.status()}`);
            }
            const responseHeaders = result.headers();
            // Use Last-Modified in preference as it is in practice
            // more reliable for conditional requests
            if (responseHeaders['last-modified']) {
              cacheInfo = {lastModified: responseHeaders['last-modified']};
            } else if (responseHeaders.etag) {
              cacheInfo = {etag: responseHeaders.etag};
            }
        }

        // Handle multi-page specs
        const pageUrls = spec.pages || [];

        if (pageUrls.length > 0) {
            const pages = [];
            for (const url of pageUrls) {
                const subAbort = new AbortController();
                const subPage = await browser.newPage();
                await subPage.setCacheEnabled(!options.forceLocalFetch);
                const subCdp = await subPage.target().createCDPSession();
                await subCdp.send('Fetch.enable');
                subCdp.on('Fetch.requestPaused', interceptRequest(subCdp, subAbort));
                try {
                    // (Note HTTP status is 0 when `file://` URLs are loaded)
                    const subresult = await subPage.goto(url, loadOptions);
                    if ((subresult.status() !== 200) && (!url.startsWith('file://') || (subresult.status() !== 0))) {
                        throw new Error(`Loading ${spec.url} triggered HTTP status ${result.status()}`);
                    }
                    const html = await subPage.evaluate(() => {
                        return document.body.outerHTML
                            .replace(/<body/, '<section')
                            .replace(/<\/body/, '</section');
                    });
                    pages.push({ url, html });
                }
                finally {
                    subAbort.abort();
                    await subCdp.detach();
                    await subPage.close();
                }
            }
            await page.evaluate(pages => {
                for (const subPage of pages) {
                    const section = document.createElement('section');
                    section.setAttribute('data-reffy-page', subPage.url);
                    section.innerHTML = subPage.html;
                    document.body.appendChild(section);
                }
            }, pages);
        }

        // Wait until the generation of the spec is completely over
        await page.evaluate(async () => {
            // Detect draft CSS server hiccups as done in browser-specs:
            // https://github.com/w3c/browser-specs/blob/b31fc0b03ba67a19162883afc30e01fcec3c600d/src/fetch-info.js#L292
            const title = (window.document.querySelector('h1')?.textContent || '')
                .replace(/\n/g, '').trim();
            if (title.startsWith('Index of ')) {
                throw new Error(`CSS server issue detected`);
            }

            const usesRespec = (window.respecConfig || window.eval('typeof respecConfig !== "undefined"')) &&
                window.document.head.querySelector("script[src*='respec']");

            function sleep(ms) {
                return new Promise(resolve => setTimeout(resolve, ms, 'slept'));
            }

            async function isReady(counter) {
                counter = counter || 0;
                if (counter > 60) {
                    throw new Error('Respec generation took too long');
                }
                if (window.document.respec?.ready) {
                    const res = await Promise.race([window.document.respec.ready, sleep(60000)]);
                    if (res === 'slept') {
                        throw new Error('Respec generation took too long');
                    }
                }
                else if (usesRespec) {
                    await sleep(1000);
                    await isReady(counter + 1);
                }
            }

            await isReady();
        });

        // Capture and report Reffy's browserlib warnings
        page.on('console', msg => {
            const text = msg.text();
            if (text.startsWith('[reffy] ')) {
                options.quiet ?? console.warn(spec.url, `[${msg.type()}]`, msg.text().substr('[reffy] '.length));
            }
        });

        // Capture and report when page throws an error
        page.on('pageerror', err => {
            options.quiet ?? console.warn(err);
        });

        // Expose additional functions defined in src/browserlib/ to the
        // browser context, under a window.reffy namespace, so that processing
        // script may call them. The script is an ES6 module and needs to be
        // loaded as such.
        // Note that we're using a fake relative URL on purpose. In practice,
        // the request will be processed by "interceptRequest", which will
        // respond with the contents of the script file. Also, there are
        // multiple path levels in that fake URL on purpose as well, because
        // scripts import the WebIDL2.js library with a URL like
        // "../../node_modules/[...]" and may import other scripts that are
        // higher in the folder tree.
        await page.addScriptTag({
            url: `reffy/scripts/${range(maxPathDepth).map(n => '__').join('/')}/reffy.mjs`,
            type: 'module'
        });

        // Run the processFunction method in the browser context
        const results = await page.evaluate(processFunction, ...args);
        results.crawlCacheInfo = cacheInfo;
        // Pending network requests may still be in the queue, flag the page
        // as closed not to send commands on a CDP session that's no longer
        // attached to anything
        abortController.abort();

        // Close CDP session and page
        // Note that gets done no matter what when browser.close() gets called.
        await cdp.detach();
        await page.close();

        return results;
    }
    finally {
        // Signal abortion again (in case an exception was thrown)
        abortController.abort();
    }
}


/**
 * Enrich the spec description with alternative URLs (versions and equivalents)
 *
 * TODO: The list used to contain published versions of TR specs retrieved from
 * the W3C API. They are useful to improve the relevance of reported anomalies.
 *
 * @function
 * @param {Object} spec Spec description structure (only the URL is useful)
 * @return {Object} The same structure, enriched with the URL of the editor's
 *   draft when one is found
 */
function completeWithAlternativeUrls(spec) {
    spec.versions = new Set();
    spec.versions.add(spec.url);
    if (spec.release) {
        spec.versions.add(spec.release.url);
    }
    if (spec.nightly) {
        spec.versions.add(spec.nightly.url);
    }
    if (specEquivalents[spec.url]) {
        spec.versions = new Set([
            ...spec.versions,
            ...specEquivalents[spec.url]
        ]);
    }
    spec.versions = [...spec.versions];
    return spec;
}


/**
 * Returns true when the given spec is the latest "fullest" level of that spec
 * in the given list of specs that passes the given predicate.
 *
 * "Fullest" means "not a delta spec, unless that is the only level that passes
 * the predicate".
 *
 * @function
 * @public
 * @param {Object} spec Spec to check
 * @param {Array(Object)} list List of specs (must include the spec to check)
 * @param {function} predicate Predicate function that the spec must pass. Must
 *   be a function that takes a spec as argument and returns a boolean.
 * @return {Boolean} true if the spec is the latest "fullest" level in the list
 *   that passes the predicate.
 */
function isLatestLevelThatPasses(spec, list, predicate) {
    predicate = predicate || (_ => true);
    if (!predicate(spec)) {
        return false;
    }
    if (spec.seriesComposition === 'delta') {
        while (spec.seriesPrevious) {
            spec = list.find(s => s.shortname === spec.seriesPrevious);
            if (!spec) {
                break;
            }
            if ((spec.seriesComposition === 'full') && predicate(spec)) {
                return false;
            }
        }
        return true;
    }
    while (spec.seriesNext) {
        if (!spec) {
            break;
        }
        spec = list.find(s => s.shortname === spec.seriesNext);
        if ((spec.seriesComposition === 'full') && predicate(spec)) {
            return false;
        }
    }
    return true;
}


/**
 * Takes the results of a crawl for a given spec and expands it to include the
 * contents of referenced files.
 *
 * The function handles both files and HTTPS resources, using either filesystem
 * functions (for files) or fetch (for HTTPS resources).
 *
 * Note the spec object is expanded in place.
 *
 * @function
 * @public
 * @param {Object} spec Spec crawl result that needs to be expanded
 * @param {string} baseFolder The base folder that contains the crawl file, or
 *   the base HTTPS URI to resolve relative links in the crawl object.
 * @param {Array(string)} properties An explicit list of properties to expand
 *   (no value means "expand all possible properties")
 * @return {Promise(object)} The promise to get an expanded crawl object that
 *   contains the contents of referenced files and no longer references external
 *   files (for the requested properties)
 */
async function expandSpecResult(spec, baseFolder, properties) {
    baseFolder = baseFolder || '';
    await Promise.all(Object.keys(spec).map(async property => {
        // Only consider properties explicitly requested
        if (properties && !properties.includes(property)) {
            return;
        }

        // Only consider properties that link to an extract, i.e. an IDL
        // or JSON file in subfolder.
        if (!spec[property] ||
                (typeof spec[property] !== 'string') ||
                !spec[property].match(/^[^\/]+\/[^\/]+\.(json|idl)$/)) {
            return;
        }
        let contents = null;
        if (baseFolder.startsWith('https:')) {
            const url = (new URL(spec[property], baseFolder)).toString();
            const response = await fetch(url, { nolog: true });
            contents = await response.text();
        }
        else {
            const filename = path.join(baseFolder, spec[property]);
            contents = await fs.readFile(filename, 'utf8');
        }
        if (spec[property].endsWith('.json')) {
            contents = JSON.parse(contents);
        }
        if (property === 'css') {
            // Special case for CSS where the "css" level does not exist
            // in the generated files
            const css = Object.assign({}, contents);
            delete css.spec;
            spec[property] = css;
        }
        else if (property === 'idl') {
            // Special case for raw IDL extracts, which are text extracts.
            // Also drop header that may have been added when extract was
            // serialized.
            if (contents.startsWith('// GENERATED CONTENT - DO NOT EDIT')) {
                const endOfHeader = contents.indexOf('\n\n');
                contents = contents.substring(endOfHeader + 2)
                // remove trailing newline added in saveIdl
                  .slice(0, -1);
            }
            spec.idl = contents;
        }
        else {
            spec[property] = contents[property];
        }
    }));
    return spec;
}


/**
 * Takes the results of a crawl (typically the contents of the index.json file)
 * and expands it to include the contents of all referenced files.
 *
 * The function handles both files and HTTPS resources, using either filesystem
 * functions (for files) or fetch (for HTTPS resources).
 *
 * Note the crawl object is expanded in place.
 *
 * @function
 * @public
 * @param {Object} crawl Crawl index object that needs to be expanded
 * @param {string} baseFolder The base folder that contains the crawl file, or
 *   the base HTTPS URI to resolve relative links in the crawl object.
 * @param {Array(string)} properties An explicit list of properties to expand
 *   (no value means "expand all possible properties")
 * @return {Promise(object)} The promise to get an expanded crawl object that
 *   contains the entire crawl report (and no longer references external files)
 */
async function expandCrawlResult(crawl, baseFolder, properties) {
    baseFolder = baseFolder || '';
    crawl.results = await Promise.all(
        crawl.results.map(spec => expandSpecResult(spec, baseFolder, properties))
    );
    return crawl;
}


/**
 * Retrieves the list of IDL attribute names that the CSS property generates
 * per the CSSOM spec, see:
 * https://drafts.csswg.org/cssom/#ref-for-css-property-to-idl-attribute
 *
 * @function
 * @param {String} property CSS property name
 * @return {Array(String)} An array of IDL attribute names, dashed attribute
 *   first, then camel-cased attribute if different, then webkit-cased attribute
 *   name if needed
 */
function getGeneratedIDLNamesByCSSProperty(property) {
    // Converts a CSS property to an IDL attribute name per the CSSOM spec:
    // https://drafts.csswg.org/cssom/#css-property-to-idl-attribute
    function cssPropertyToIDLAttribute(property, lowercaseFirst) {
        let output = '';
        let uppercaseNext = false;
        if (lowercaseFirst) {
            property = property.substr(1);
        }
        for (const c of property) {
            if (c === '-') {
                uppercaseNext = true;
            } else if (uppercaseNext) {
                uppercaseNext = false;
                output += c.toUpperCase();
            } else {
                output += c;
            }
        }
        return output;
    }

    // Start with dashed attribute
    const res = [property];

    // Add camel-cased attribute if different
    const camelCased = cssPropertyToIDLAttribute(property, false);
    if (camelCased !== property) {
        res.push(camelCased);
    }

    // Add webkit-cased attribute if needed
    if (property.startsWith('-webkit-')) {
        res.push(cssPropertyToIDLAttribute(property, true));
    }

    return res;
};


/**
 * Creates the given folder if it does not exist yet.
 *
 * @function
 * @public
 * @param {String} folder Path to folder to create
 *   (from current working directory)
 */
async function createFolderIfNeeded(folder) {
    try {
        await fs.mkdir(folder);
    }
    catch (err) {
        if (err.code !== 'EEXIST') {
            throw err;
        }
    }
}


module.exports = {
    fetch,
    requireFromWorkingDirectory,
    expandBrowserModules,
    setupBrowser,
    teardownBrowser,
    processSpecification,
    completeWithAlternativeUrls,
    isLatestLevelThatPasses,
    expandCrawlResult,
    expandSpecResult,
    getGeneratedIDLNamesByCSSProperty,
    createFolderIfNeeded
};
