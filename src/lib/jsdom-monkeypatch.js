/**
 * Reffy runs ReSpec in JSDOM to avoid having to download an run a complete
 * headless browser.
 *
 * Problem is JSDOM does not yet support a number of features that ReSpec needs.
 * Also, JSDOM does not allow interception of network requests anymore.
 *
 * This code monkey-patches JSDOM (and ReSpec) code before other modules make
 * use of them, so that ReSpec can run in JSDOM and so that network requests
 * use our fetch implementation.
 *
 * This module needs to be required before any other module that make use of
 * JSDOM.
 *
 * The whole thing is PRETTY UGLY.
 *
 * NB: This code WILL LIKELY BREAK when switching to new versions of JSDOM or
 * ReSpec.
 */

const Attr = require('jsdom/lib/jsdom/living/generated/Attr').interface;
const Element = require('jsdom/lib/jsdom/living/generated/Element').interface;
const fetch = require('./fetch.js');
const { Headers, Request, Response } = require('node-fetch');


// JSDOM does not yet support innerText. Only used in Respec
// to set text of empty elements, so replacing with
// textContent should be good enough
// https://github.com/jsdom/jsdom/issues/1245
if (!Element.prototype.innerText) {
  Object.defineProperty(Element.prototype, 'innerText', {
    get() {
      if (!this) {
        throw new TypeError("Illegal invocation");
      }
      return this.textContent;
    },

    set(V) {
      if (!this) {
        throw new TypeError("Illegal invocation");
      }
      this.textContent = V;
    },

    enumerable: true,
    configurable: true
  });
}


// Not yet supported in JSDOM for attributes
// (but needed by HyperHTML)
// https://github.com/jsdom/jsdom/commit/acf0156b563b5e2ba606da36fd597e0a0b344f5a
// https://github.com/jsdom/jsdom/issues/1641
if (!Attr.prototype.cloneNode) {
  Attr.prototype.cloneNode = function () {
    if (!this.ownerDocument) {
      // Cloning an attribute that does not yet belong to a document is possible
      // in theory, but we have a major problem here: we simply do not have any
      // pointer to the window/document that triggers the request (and
      // prototypes are shared across browser contexts in JSDOM)
      throw new Error('Cannot clone an attribute that does not belong to a document!');
    }
    let attr = this.ownerDocument.createAttributeNS(
      this.namespaceURI, this.name);
    attr.value = this.value;
    return attr;
  };
}


// That's it, JSDOM will now use our `download` function and all specs that
// reference ReSpec will download the latest version (with our monkey patch).
const { JSDOM, ResourceLoader } = require('jsdom');


// Extends JSDOM's resource loader to monkey patch ReSpec and ignore requests
// to scripts we know we don't need
class ReffyResourceLoader extends ResourceLoader {
  fetch(url, options) {
    // Restrict resource loading to ReSpec and script resources that sit next
    // to the spec under test, excluding scripts of WebIDL as well as the
    // WHATWG annotate_spec script that JSDOM does not seem to like.
    // Explicitly whitelist the "autolink" script of the shadow DOM spec which
    // is needed to initialize respecConfig
    // TEMP: Force use of previous version of Respec, see https://github.com/tidoust/reffy/issues/134
    //const respecUrl = 'https://www.w3.org/Tools/respec/respec-w3c-common';
    const respecUrl = 'https://raw.githubusercontent.com/w3c/respec/f17445a290e4619fda7e85afbd76f14390974114/builds/respec-w3c-common.js';
    function getUrlToFetch() {
      const oUrl = new URL(url);
      let referrer = options.referrer;
      if (!referrer.endsWith('/')) {
        referrer = referrer.substring(0, referrer.lastIndexOf('/') + 1);
      }
      if (/\/respec[\/\-]/i.test(oUrl.pathname)) {
        //console.log(`fetch ReSpec (force latest version)`);
        return respecUrl;
      }
      else if (/\.[^\/\.]+$/.test(oUrl.pathname) &&
          !oUrl.pathname.endsWith('.js') &&
          !oUrl.pathname.endsWith('.json')) {
        //console.log(`fetch not needed for ${oUrl.href} (not a JS/JSON file)`);
        return null;
      }
      else if ((oUrl.pathname === '/webcomponents/assets/scripts/autolink.js') ||
          ((oUrl.href.startsWith(referrer) || referrer.startsWith(oUrl.origin)) &&
            !(/annotate_spec/i.test(oUrl.pathname)) &&
            !(/expanders/i.test(oUrl.pathname)) &&
            !(/bug-assist/i.test(oUrl.pathname)) &&
            !(/dfn/i.test(oUrl.pathname)) &&
            !(/section-links/i.test(oUrl.pathname)) &&
            !(/^\/webidl\//i.test(oUrl.pathname)))) {
        //console.log(`fetch useful script at ${oUrl.href}`);
        return oUrl.href;
      }
      //console.log(`fetch not needed for ${oUrl.href}`, options.referrer);
      return null;
    }

    let urlToFetch = getUrlToFetch();
    if (!urlToFetch) {
      return Promise.resolve(Buffer.from(''));
    }
    return fetch(urlToFetch, options)
      .then(response => response.text())
      .then(data => {
        if (urlToFetch !== respecUrl) {
            return Buffer.from(data);
        }

        ////////////////////////////////////////////////////////////
        // REALLY UGLY CODE WARNING
        //
        // Tweak Respec built code so that it can run in JSDOM.
        //
        // NB: Some of these lines will just break if Respec build
        // produces slightly different code, e.g. if variables do
        // not end up with the same name!
        ////////////////////////////////////////////////////////////

        // Remove core/highlight module because JSDOM does not yet
        // support URL.createObjectURL
        // https://github.com/jsdom/jsdom/issues/1721
        // Remove core/list-sorter module because JSDOM does not yet
        // support document.createRange
        // https://github.com/jsdom/jsdom/blob/master/lib/jsdom/living/nodes/Document.webidl#L39
        ["core/highlight", "core/list-sorter"]
          .forEach(module => data = data.replace(
            new RegExp('(define\\(\\s*"profile-w3c-common"\\s*,\\s*\\[[^\\]]+),\\s*"' + module + '"'),
            '$1'));

        // JSDOM's CSS parser does not quite like uncommon "@" rules
        // so let's pretend they are just @media rules
        // https://github.com/jsdom/jsdom/issues/2026
        // (NB: this replacement is just for convenience, to avoid JSDOM reporting
        // lengthy errors (including a full dump of the CSS) to stderr
        data = data.replace(/@keyframes \S+? {/, '@media all {');
        data = data.replace(/@supports \(.+?\) {/, '@media all {');

        // Respec drops blank lines in Markdown, but marked.js actually
        // needs them around <pre> tags, otherwise it produces really weird
        // HTML (with <pre> and <p> intertwined). For some reason, this does
        // not bother regular browsers. It does bother JSDOM though.
        data = data.replace(/r\.createTextNode\("\\n"\)/, 'r.createTextNode("\\n\\n")');

        // JSDOM does not support cloning of attributes yet, and polyfill
        // only works for attributes that already belong to a document.
        // HyperHTML needs to clone attributes that do not belong to the
        // document, so let's intercept the call to `cloneNode` in HyperHTML
        // and use `createAttributeNS` instead
        // https://github.com/jsdom/jsdom/commit/acf0156b563b5e2ba606da36fd597e0a0b344f5a
        data = data.replace(/p=r\.cloneNode\(!0\);/,
            `p = null;
            if (r.ownerDocument) {
                p = r.cloneNode(true);
            } else {
                p = document.createAttributeNS(r.namespaceURI,r.name);
                p.value = r.value;
            }`);

        return Buffer.from(data);
        ////////////////////////////////////////////////////////////
        // END OF REALLY UGLY CODE WARNING
        ////////////////////////////////////////////////////////////
      });
  }
}


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

    // Not yet supported in JSDOM and cannot be directly monkey-patched.
    // (and actually, good for us since we want to control caching logic here)
    // https://github.com/jsdom/jsdom/issues/1724
    if (!window.fetch) {
      window.fetch = async function (url, options) {
        if (url.url) {
          // Called with a Request object
          if (url.headers) {
            options = Object.assign({}, options, {
              headers: url.headers
            });
          }
          url = url.url;
        }
        if (!url.startsWith('http:') && !url.startsWith('https:')) {
          let a = window.document.createElement('a');
          a.href = url;
          url = a.href;
        }
        return fetch(url, options);
      };

      window.Request = Request;
      window.Response = Response;
      window.Headers = Headers;
    }

    if (beforeParse) {
      return beforeParse(window);
    }
  };

  // Use our own resource loader
  const resourceLoader = new ReffyResourceLoader();
  options.resources = resourceLoader;

  return new JSDOM(html, options);
};


// Not much we can do but:
// 1. JSDOM does not support `IndexedDB`, which Respec uses to
// store the biblio. No big deal as Respec degrades gracefully
// but that outputs errors to the console when trying to call
// `IndexedDB.open`
// https://github.com/jsdom/jsdom/issues/1748
// 2. JSDOM does not support the `whatToShow` filter in
// `TreeWalker`. As a result, HyperHTML fails to remove the
// `<!-- _hyper: xxxx -->` comments it adds while running.

// Also, Node.js is prompt to output warnings on what it thinks are unhandled
// promise rejections but are usually rejections that are handled asynchronously
// (i.e. not on the same tick). Let's intercept these warnings not to output
// false positives.
/*process.on('unhandledRejection', () => {});
process.on('rejectionHandled', () => {});*/
