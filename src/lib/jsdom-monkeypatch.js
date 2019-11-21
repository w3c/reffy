/**
 * Reffy runs JSDOM to avoid having to download an run a complete
 * headless browser.
 *
 * Problem is JSDOM does not yet support some features that inline scripts
 * may use.
 *
 * This code monkey-patches JSDOM.
 *
 * This module needs to be required before any other module that make use of
 * JSDOM.
 */

const { JSDOM } = require('jsdom');

// Window methods cannot be monkey-patched in the interface prototype, because
// `this` is not always set to the Window object when these methods, probably
// because the global object in Node.js is not the Window instance. For these
// methods, we need to monkey-patch the code in the JSDOM `beforeParse` method,
// called when the Window instance is created.
module.exports.JSDOM = function (html, options) {
  options = Object.assign({}, options);
  const beforeParse = options.beforeParse;
  options.beforeParse = function (window) {
    // Not yet supported in JSDOM and JSDOM define them in the Window
    // constructor, so we need to override them after that.
    // (most are not used in our specs, but some still call "scrollBy")
    // https://github.com/jsdom/jsdom/blob/master/lib/jsdom/browser/Window.js#L570
    ['blur', 'focus', 'moveBy', 'moveTo', 'resizeBy', 'resizeTo', 'scroll', 'scrollBy', 'scrollTo']
      .forEach(method => window[method] = function () {});

    // Not yet supported in JSDOM
    // https://github.com/jsdom/jsdom/blob/master/test/web-platform-tests/to-upstream/html/browsers/the-window-object/window-properties-dont-upstream.html#L104
    if (!window.matchMedia) {
      window.matchMedia = function () {
        return {
          matches: false,
          addListener: () => {},
          removeListener: () => {},
          onchange: () => {}
        };
      };
    }

    if (beforeParse) {
      return beforeParse(window);
    }
  };

  return new JSDOM(html, options);
};
