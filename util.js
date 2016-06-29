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
                // only load respec, to avoid jsdom bugs
                SkipExternalResources: /^((?!respec).)*$/
            },
            done: function(err, window) {
                if (err) {
                    return reject(err);
                }
                return resolve(window);
            }
        });
    });
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
module.exports.getDocumentAndGenerator = getDocumentAndGenerator;
