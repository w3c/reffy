/**
 * Setup a proxy server that intercepts some network requests. To be used in
 * tests not to hit the network.
 *
 * @module mock-server
 */

import { MockAgent, setGlobalDispatcher } from 'undici';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const scriptPath = path.dirname(fileURLToPath(import.meta.url));

/**
 * Determine the path to the "node_modules" folder. The path depends on whether
 * Reffy is run directly, or installed as a library.
 *
 * @function
 * @return {String} Path to the node_modules folder.
 */
function getModulesFolder() {
    const rootFolder = path.resolve(scriptPath, '../..');
    let folder = path.resolve(rootFolder, 'node_modules');
    if (existsSync(folder)) {
        return folder;
    }
    folder = path.resolve(rootFolder, '..');
    return folder;
}
const modulesFolder = getModulesFolder();

const mockSpecs = {
  "/woff/woff2/": {
    html: `
      <title>WOFF2</title>
      <body>
        <dfn id='foo' data-dfn-type="dfn">Foo</dfn>
        <a href="https://www.w3.org/TR/bar/#baz">bar</a>
        <ul class='toc'><li><a href='page.html'>page</a></ul>`,
    pages: {
      "page.html": `<h2 id='bar'>Heading in subpage</h2>`
    }
  },
  "/mediacapture-output/": `
    <script>respecConfig = { shortName: 'test' };</script>
    <script src='https://www.w3.org/Tools/respec/respec-w3c'></script>
    <div id=abstract></div>
    <pre class='idl'>[Exposed=Window] interface Foo { attribute DOMString bar; };</pre>`,
  "/accelerometer/": `<html><meta name='document-revision' content='c0917d216986f88bdd43c72c0b13352c71f283aa'>
    <h2>Normative references</h2>
    <dl>
      <dt>FOO</dt>
      <dd><a href='https://www.w3.org/TR/Foo'>Foo</a></dd>
    </dl>`,
  "/pointerlock/": `<html>
    <h1>Pointer Lock 2.0`,
  "/TR/remote-playback/": {
    html: `<title>Published version</title>
      <body><h1>Published version</h1></body>`,
    domain: 'https://www.w3.org'
  }
};

const respecHiglight = readFileSync(
  path.join(modulesFolder, "respec-hljs", "dist", "respec-highlight.js"),
  'utf8'
);
const respecW3C = readFileSync(
  path.join(modulesFolder, "respec", "builds", "respec-w3c.js"),
  'utf8'
);

const mockAgent = new MockAgent();
setGlobalDispatcher(mockAgent);
mockAgent.disableNetConnect();
// for chrome devtool protocol
mockAgent.enableNetConnect('127.0.0.1');

for (const [path, desc] of Object.entries(mockSpecs)) {
  mockAgent.get(desc.domain || "https://w3c.github.io")
    .intercept({ method: "GET", path })
    .reply(200, desc.html || desc, {
      headers: { "Content-Type": "text/html" }
    })
    .persist();

  for (const [page, pageContent] of Object.entries(desc.pages || {})) {
    mockAgent.get(desc.domain || "https://w3c.github.io")
      .intercept({ method: "GET", path: path + page })
      .reply(200, pageContent, {
        headers: { "Content-Type": "text/html" }
      })
      .persist();
  }
}


// Handling requests generated by ReSpec documents
mockAgent
  .get("https://api.specref.org")
  .intercept({ method: "GET", path: "/bibrefs?refs=webidl" })
  .reply(200, { webidl: { href: "https://webidl.spec.whatwg.org/" } }, {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  })
  .persist();

mockAgent
  .get("https://www.w3.org")
  .intercept({ method: "GET", path: "/scripts/TR/2021/fixup.js" })
  .reply(200, '')
  .persist();

mockAgent
  .get("https://www.w3.org")
  .intercept({ method: "GET", path: "/StyleSheets/TR/2021/logos/W3C" })
  .reply(200, '')
  .persist();

mockAgent
  .get("https://www.w3.org")
  .intercept({ method: "GET", path: "/Tools/respec/respec-highlight" })
  .reply(200, respecHiglight, {
    headers: { "Content-Type": "application/js" }
  })
  .persist();

mockAgent
  .get("https://www.w3.org")
  .intercept({ method: "GET", path: "/Tools/respec/respec-w3c" })
  .reply(200, respecW3C, {
    headers: { "Content-Type": "application/js" }
  })
  .persist();

mockAgent
  .get("https://www.w3.org")
  .intercept({ method: "GET", path: "/TR/idontexist/" })
  .reply(404, '');

mockAgent
  .get("https://www.w3.org")
  .intercept({ method: "GET", path: "/TR/ididnotchange/" })
  .reply(({ headers }) => {
    // NB: Before Node.js v18.17.0, the headers parameters is not an instance
    // of Headers as suggested in examples, but rather an array that alternates
    // header names and header values. Bug detailed at:
    // https://github.com/nodejs/undici/issues/2078
    // Bug fix was integrated in Node.js v18.17.0.
    // Code below can be simplified when support for Node.js v18 gets dropped.
    let value;
    if (Array.isArray(headers)) {
      const pos = headers.findIndex(h => h === 'If-Modified-Since');
      if (pos === -1) {
        return { statusCode: 200, data: 'Unexpected If-Modified-Since header' };
      }
      value = headers[pos+1];
    }
    else {
      value = headers['If-Modified-Since'];
    }
    if (value === "Fri, 11 Feb 2022 00:00:42 GMT") {
      return { statusCode: 304 };
    } else {
      return { statusCode: 200, data: 'Unexpected If-Modified-Since header' };
    }
  });

mockAgent
  .get("https://www.w3.org")
  .intercept({ method: "GET", path: "/TR/iredirect/" })
  .reply(200,
    `<!DOCTYPE html><script>window.location = '/TR/recentlyupdated/';</script>`,
    {
      headers: {
        "Content-Type": "text/html",
        "Last-Modified": "Fri, 11 Feb 2022 00:00:42 GMT"
      }
    }
  );

mockAgent
  .get("https://www.w3.org")
  .intercept({ method: "GET", path: "/TR/recentlyupdated/" })
  .reply(200,
    `<html><title>Recently updated</title>
    <h1>Recently updated</h1>`,
    {
      headers: {
        "Content-Type": "text/html",
        "Last-Modified": (new Date()).toString()
      }
    }
  );

mockAgent
  .get("https://drafts.csswg.org")
  .intercept({ method: "GET", path: "/server-hiccup/" })
  .reply(200,
    `<html><title>Server hiccup</title>
    <h1> Index of Server Hiccup Module Level 42 </h1>`,
    { headers: { "Content-Type": "text/html" } })
  .persist();

/*nock.emitter.on('error', function (err) {
  console.error(err);
});
nock.emitter.on('no match', function(req, options, requestBody) {
  // 127.0.0.1 is used by the devtool protocol, we ignore it
  if (req && req.hostname !== '127.0.0.1') {
    console.error("No match for nock request on " + (options ? options.href : req.href));
  }
});*/

export default mockAgent;
