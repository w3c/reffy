import { describe, it, after } from 'node:test';
import { crawlSpecs } from "../src/lib/specs-crawler.js";
import mockServer from '../src/lib/mock-server.js';
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert";
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadJSON } from "../src/lib/util.js";

import packageConfig from '../package.json' with { type: 'json' };
const reffyVersion = packageConfig.version;

const scriptPath = path.dirname(fileURLToPath(import.meta.url));

const specs = [
  {url: "https://www.w3.org/TR/WOFF2/", nightly: {url: "https://w3c.github.io/woff/woff2/", pages:["https://w3c.github.io/woff/woff2/page.html"]}},
  {url: "https://www.w3.org/TR/audio-output/", nightly: {url: "https://w3c.github.io/mediacapture-output/"}},
  {url: "https://www.w3.org/TR/accelerometer/", nightly: {url: "https://w3c.github.io/accelerometer/"}}
];

async function crawl() {
  const results = await crawlSpecs(specs, { forceLocalFetch: true });
  // to avoid reporting bogus diff on updated date
  results.forEach(s => delete s.date);
  return results;
}

async function runWithAnnotatedCrawlData(path, fn) {
  const rawCrawlData = fs.readFileSync(path);
  let crawlData = JSON.parse(rawCrawlData);
  crawlData.crawler = `reffy-${reffyVersion}`;
  fs.writeFileSync(path, JSON.stringify(crawlData));
  const res = await fn();
  fs.writeFileSync(path, rawCrawlData);
  return res;
}
if (process.argv.includes('--update-fixture')) {
  // when called with --update-fixture, we update the fixture file used for comparison
  (async function () {
    const results = await crawl();
    fs.writeFileSync(scriptPath + "/crawl-test.json", JSON.stringify(results, null, 2), "utf-8");
  })().catch(err => {
    console.error(err);
    process.exit(2);
  });
}


describe("The crawler", {timeout: 60000}, function () {
  it("runs without errors on a small sample of specs", async () => {
    const refResults = JSON.parse(fs.readFileSync(scriptPath + "/crawl-test.json", "utf-8"));
    const results = await crawl();
    for (const result of results) {
      if (result?.ids?.length) {
        result.ids = result.ids.filter(id => !id.match(/\#respec\-/));
      }
    }
    for (let i in refResults) {
      for (let prop in refResults[i]) {
        assert.deepEqual(results[i][prop], refResults[i][prop],
			 `Unexpected crawl results for ${refResults[i].url} (property "${prop}")`);
      }
      assert.deepEqual(results[i], refResults[i],
		       `Unexpected properties found in crawl result for ${refResults[i].url}`);
    }
  });

  it("supports 'file' URLs", async () => {
    const fileurl = (new URL('crawl-spec.html', `file://${scriptPath}/`)).href;
    const results = await crawlSpecs([{
      url: fileurl,
      nightly: { url: fileurl }
    }], { forceLocalFetch: true });
    assert.equal(results[0].title, 'A test spec');
  });

  it("matches spec shortnames", async () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'reffy-'));
    const refResults = JSON.parse(fs.readFileSync(scriptPath + "/crawl-test.json", "utf-8"))
          .find(res => res.url === 'https://www.w3.org/TR/accelerometer/');
    await crawlSpecs({
      specs: ['accelerometer'],
      output: output,
      forceLocalFetch: true
    });
    const results = await loadJSON(path.resolve(output, 'index.json'));
    assert.equal(results.results[0].title, 'Accelerometer');
  });

  it("matches spec series shortnames", async () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'reffy-'));
    await crawlSpecs({
      specs: ['pointerlock'],
      output: output,
      forceLocalFetch: true
    });
    const results = await loadJSON(path.resolve(output, 'index.json'));
    assert.equal(results.results[0].url, 'https://www.w3.org/TR/pointerlock-2/');
  });

  it("interprets filenames relative to the current folder", async () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'reffy-'));
    await crawlSpecs({
      specs: [path.join(path.relative(process.cwd(), scriptPath), 'crawl-spec.html')],
      output: output,
      forceLocalFetch: true
    });
    const results = await loadJSON(path.resolve(output, 'index.json'));
    assert.equal(results.results[0].title, 'A test spec');
  });

  it("skips processing and reuse fallback data when spec cache info indicates it has not changed", async () => {
    const url = "https://www.w3.org/TR/ididnotchange/";
    const fallback = path.resolve(scriptPath, 'crawl-cache.json');
    const results = await runWithAnnotatedCrawlData(fallback, async () => crawlSpecs(
      [{ url, nightly: { url } }],
      {
        forceLocalFetch: true,
        fallback
      }));
    assert.equal(results[0].title, "Change is the only constant");
    assert.ifError(results[0].error);
    assert.equal(results[0].refs, "A useful list of refs");
  });

  it("does not return cache info when a redirection took place", async () => {
    const url = "https://www.w3.org/TR/iredirect/";
    const results = await crawlSpecs(
      [{ url, nightly: { url } }],
      { forceLocalFetch: true });
    assert.equal(results[0].title, "Recently updated");
    assert.equal(results[0].crawlCacheInfo, undefined);
  })

  it("reports HTTP error statuses", async () => {
    const url = "https://www.w3.org/TR/idontexist/";
    const results = await crawlSpecs(
      [{ url, nightly: { url } }],
      { forceLocalFetch: true });
    assert.equal(results[0].title, "[Could not be determined, see error]");
    assert(results[0].error.includes("Loading https://www.w3.org/TR/idontexist/ triggered HTTP status 404"));
  });

  it("reports errors and returns fallback data when possible", async () => {
    const url = "https://www.w3.org/TR/idontexist/";
    const fallback = path.resolve(scriptPath, 'crawl-fallback.json');
    const results = await crawlSpecs(
      [{ url, nightly: { url } }],
      {
        forceLocalFetch: true,
        fallback
      });
    assert.equal(results[0].title, "On the Internet, nobody knows you don't exist");
    assert(results[0].error.includes("Loading https://www.w3.org/TR/idontexist/ triggered HTTP status 404"));
    assert.equal(results[0].refs, "A useful list of refs");
  });

  it("saves fallback extracts in target folder", async () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), "reffy-"));
    const url = "https://www.w3.org/TR/idontexist/";
    await crawlSpecs({
      specs: [{ url, nightly: { url } }],
      output: output,
      forceLocalFetch: true,
      fallback: path.resolve(scriptPath, "crawl-fallback.json")
    });
    const results = await loadJSON(path.resolve(output, "index.json"));
    assert.equal(results.results[0].url, "https://www.w3.org/TR/idontexist/");
    assert(results.results[0].error.includes("Loading https://www.w3.org/TR/idontexist/ triggered HTTP status 404"));
    assert.equal(results.results[0].refs, "refs/idontexist.json");
    const refs = await loadJSON(path.resolve(output, "refs", "idontexist.json"));
    assert.equal(refs.refs, "A useful list of refs");
  });

  it("reports draft CSS server issues", async () => {
    const url = "https://drafts.csswg.org/server-hiccup/";
    const results = await crawlSpecs(
      [{ url, nightly: { url } }],
      { forceLocalFetch: true });
    assert.equal(results[0].title, "[Could not be determined, see error]");
    assert(results[0].error.includes("CSS server issue detected"));
  });

  it("crawls the published spec when `--release` is set", async () => {
    const url = "https://www.w3.org/TR/remote-playback/";
    const results = await crawlSpecs(
      [{ url, nightly: { url: 'https://w3c.github.io/idontexist' }, release: { url } }],
      { publishedVersion: true, forceLocalFetch: true });
    assert.equal(results[0].title, "Published version");
  });

  it("skips non-published specs when `--release` is set", async () => {
    const url = "https://w3c.github.io/non-published/";
    const results = await crawlSpecs(
      [{ url, nightly: { url } }],
      { publishedVersion: true });
    assert.equal(results.length, 0);
  });

  it("does not attempt to crawl specs without a nightly URL", async () => {
    const url = "https://www.iso.org/standard/85253.html";
    const results = await crawlSpecs(
      [{ url }],
      { forceLocalFetch: true });
    assert.deepStrictEqual(results[0], { url, versions: [url] });
  });

  after(() => {
    if (mockServer.pendingInterceptors().length > 0) {
      throw new Error("Additional network requests expected on:\n- " + mockServer.pendingInterceptors().map(miss => miss.origin + miss.path).join('\n- '));
    }
  });
});
