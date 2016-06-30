var jsdom = require('jsdom');

/**
 * Load the given specification.
 *
 * @function
 * @public
 * @param {String} url The URL of the specification to load
 * @return {Promise} The promise to get a window object once the spec has
 *   been loaded with jsdom.
 */
function loadSpecification(url) {
    return new Promise(function (resolve, reject) {
        jsdom.env({
            url: url,
            features: {
                FetchExternalResources: ['script'],
                ProcessExternalResources: ['script'],
                SkipExternalResources: false
            },
            resourceLoader: function (resource, callback) {
                // Restrict resource loading to ReSpec and script resources
                // that sit next to the spec under test, excluding scripts
                // of WebIDL as well as the WHATWG annotate_spec script that
                // jsdom does not seem to like
                // Explicitly whitelist the "autolink" script of the shadow DOM
                // spec which is needed to initialize respecConfig
                var baseUrl = resource.baseUrl;
                if (!baseUrl.endsWith('/')) {
                    baseUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
                }
                if (/\/respec\//i.test(resource.url.path)) {
                    return resource.defaultFetch(callback);
                }
                else if ((resource.url.pathname === '/webcomponents/assets/scripts/autolink.js') ||
                    (resource.url.href.startsWith(baseUrl) &&
                        !(/annotate_spec/i.test(resource.url.pathname)) &&
                        !(/link-fixup/i.test(resource.url.pathname)) &&
                        !(/bug-assist/i.test(resource.url.pathname)) &&
                        !(/dfn/i.test(resource.url.pathname)) &&
                        !(/section-links/i.test(resource.url.pathname)) &&
                        !(/^\/webidl\//i.test(resource.url.pathname)))) {
                    return resource.defaultFetch(callback);
                }
                else {
                    return callback(null, '');
                }
            },
            done: function(err, window) {
                if (err) {
                    return reject(err);
                }
                return resolve(window);
            }
            /*,virtualConsole: jsdom.createVirtualConsole().sendTo(console)*/
        });
    });
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
