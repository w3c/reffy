/**
 * A bunch of utility functions common to multiple scripts
 */

const path = require('path');
const URL = require('url');
const fetch = require('./fetch');
const specEquivalents = require('../specs/spec-equivalents.json');
const canonicalizeURL = require('./canonicalize-url').canonicalizeURL;
const { JSDOM } = require('./jsdom-monkeypatch');
const writeRespecDocument = require("respec/tools/respecDocWriter").fetchAndWrite;


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
 * Load the given HTML.
 *
 * @function
 * @public
 * @param {Object} spec The spec to load. Must contain an "html" property with
 *   the HTML contents to load. May also contain an "url" property with the URL
 *   of the document (defaults to "about:blank"), and a "responseUrl" property
 *   with the final URL of the document (which may differ from the initial URL
 *   in case there were redirects and which defaults to the value of the "url"
 *   property)
 * @param {Number} counter Optional loop counter parameter to detect infinite
 *   loop. The parameter is mostly meant to be an internal parameter, set and
 *   incremented between calls when dealing with redirections. There should be
 *   no need to set that parameter when calling that function externally.
 * @return {Promise} The promise to get a window object once the spec has
 *   been loaded with jsdom.
 */
async function loadSpecificationFromHtml(spec, counter) {
    let url = spec.url || 'about:blank';
    let responseUrl = spec.responseUrl || url;
    let html = spec.html || '';
    counter = counter || 0;

    // Prevent execution of Shepherd script in CSS specs that makes
    // node.js run forever.
    html = html.replace(/system\.addLoadEvent\(setupPage\);/, '');

    // Drop Byte-Order-Mark character if needed, it bugs JSDOM
    if (html.charCodeAt(0) === 0xFEFF) {
        html = html.substring(1);
    }
    let {window} = new JSDOM(html, {
        url: responseUrl,
        runScripts: 'dangerously'
    });
    const doc = window.document;

    // Handle <meta http-equiv="refresh"> redirection
    // Note that we'll assume that the number in "content" is correct
    let metaRefresh = doc.querySelector('meta[http-equiv="refresh"]');
    if (metaRefresh) {
        let redirectUrl = (metaRefresh.getAttribute('content') || '').split(';')[1];
        redirectUrl = redirectUrl.trim().replace(/url=/i, '');
        if (redirectUrl) {
            redirectUrl = URL.resolve(doc.baseURI, redirectUrl);
            if ((redirectUrl !== url) && (redirectUrl !== responseUrl)) {
                return loadSpecificationFromUrl(redirectUrl, counter + 1);
            }
        }
    }

    // Handle links to single page in multi-page specs
    const links = doc.querySelectorAll('body .head dl a[href]');
    for (let i = 0 ; i < links.length; i++) {
        let link = links[i];
        let text = (link.textContent || '').toLowerCase();
        if (text.includes('single page') ||
            text.includes('single file') ||
            text.includes('single-page') ||
            text.includes('one-page')) {
            let singlePage = URL.resolve(doc.baseURI, link.getAttribute('href'));
            if ((singlePage === url) || (singlePage === responseUrl)) {
                // We're already looking at the single page version
                return window;
            }
            else {
                return loadSpecificationFromUrl(singlePage, counter + 1);
            }
        }
    }

    // Handle remaining multi-page specs manually, merging all subpages
    // into the main page to create a single-page spec.
    let multiPagesRules = {
        'https://www.w3.org/TR/CSS2/': '.quick.toc .tocxref',
        'https://www.w3.org/TR/CSS22/': '#toc .tocxref',
        'https://drafts.csswg.org/css2/': '.quick.toc .tocxref'
    };
    if (multiPagesRules[spec.url]) {
        const pages = [...doc.querySelectorAll(multiPagesRules[spec.url])]
            .map(link => URL.resolve(doc.baseURI, link.getAttribute('href')));
        const subWindows = await Promise.all(
            pages.map(page => loadSpecificationFromUrl(page)));
        subWindows.map(subWindow => {
            const section = doc.createElement('section');
            [...subWindow.document.body.children].forEach(
                child => section.appendChild(child));
            doc.body.appendChild(section);
        });
    }

    // If spec is a ReSpec source spec, we need to generate it. This cannot be
    // done using JSDOM because it is not powerful enough to run ReSpec, so
    // we'll need to go through respecDocWriter (which runs Puppeteer in the
    // background). Unfortunately, that means another network fetch is needed
    if (doc.querySelector('script[src*=respec]')) {
        // Make sure that all timers stop running on the spec that was loaded
        // (typically, the Touch Events spec uses "setInterval" to detect when
        // Respec is done, which never stops because Respec did not run)
        window.close();
        window = await writeRespecDocument(url, '', {}, 200000).then(html => {
            const {window} = new JSDOM(html, {
                url: responseUrl,
                runScripts: 'dangerously'
            });
            return window;
        });
    }

    return window;
}


/**
 * Load the specification at the given URL.
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
function loadSpecificationFromUrl(url, counter) {
    counter = counter || 0;
    if (counter >= 5) {
        return new Promise((resolve, reject) => {
            reject(new Error('Infinite loop detected'));
        });
    }
    return fetch(url)
        .then(response => response.text().then(html => {
            return { url, html, responseUrl: response.url };
        }))
        .then(spec => loadSpecificationFromHtml(spec, counter));
}


/**
 * Load the given specification.
 *
 * @function
 * @public
 * @param {String|Object} spec The URL of the specification to load or an object
 *   with an "html" key that contains the HTML to load (and an optional "url"
 *   key to force the URL in the loaded DOM)
 * @return {Promise} The promise to get a window object once the spec has
 *   been loaded with jsdom.
 */
function loadSpecification(spec) {
    spec = (typeof spec === 'string') ? { url: spec } : spec;
    return (spec.html ?
        loadSpecificationFromHtml(spec) :
        loadSpecificationFromUrl(spec.url));
}

function urlOrDom(input) {
    if (typeof input === "string") {
        return loadSpecification(input);
    } else {
        return Promise.resolve(input);
    }
}

/**
 * Given a "window" object loaded with jsdom, retrieve the document along
 * with the name of the well-known generator that was used, if known.
 *
 * Note that the function expects the generation of documents generated
 * on-the-fly to have already happened
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
        var generator = window.document.querySelector('meta[name="generator"]');
        if (generator && generator.content.match(/bikeshed/i)) {
            resolve({doc, generator: 'bikeshed'});
        } else if ((generator && generator.content.match(/respec/i)) ||
                (doc.body.id === 'respecDocument') ||
                window.respecConfig ||
                window.eval('typeof respecConfig !== "undefined"')) {
            resolve({doc, generator: 'respec'});
        } else if (doc.getElementById('anolis-references')) {
            resolve({doc, generator: 'anolis'});
        } else {
            resolve({doc});
        }
    });
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
            const versions = s._embedded['version-history'].map(prop("uri")).map(canonicalizeURL);
            const editors = s._embedded['version-history'].map(prop("editor-draft")).filter(u => !!u).map(canonicalizeURL);
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
    const extensionMatch = spec.url.match(/\/.*\.github\.io\/([^\/]*)\/extension\.html$/);
    if (extensionMatch) {
        return extensionMatch[1] + '-extension';
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
    return spec.url.replace(/[^-a-z0-9]/g, '');
}

module.exports.fetch = fetch;
module.exports.requireFromWorkingDirectory = requireFromWorkingDirectory;
module.exports.loadSpecification = loadSpecification;
module.exports.urlOrDom = urlOrDom;
module.exports.getDocumentAndGenerator = getDocumentAndGenerator;
module.exports.completeWithShortName = completeWithShortName;
module.exports.completeWithInfoFromW3CApi = completeWithInfoFromW3CApi;
module.exports.getShortname = getShortname;
