const { crawlList, crawlSpecs } = require("../src/lib/specs-crawler");
const nock = require('../src/lib/nock-server');
const fs = require("fs");
const path = require("path");
const os = require("os");

const specs = [
  {url: "https://www.w3.org/TR/WOFF2/", nightly: {url: "https://w3c.github.io/woff/woff2/", pages:["https://w3c.github.io/woff/woff2/page.html"]}},
  {url: "https://www.w3.org/TR/audio-output/", nightly: {url: "https://w3c.github.io/mediacapture-output/"}},
  {url: "https://www.w3.org/TR/accelerometer/", nightly: {url: "https://w3c.github.io/accelerometer/"}}
];

async function crawl() {
  const results = await crawlList(specs) ;
  // to avoid reporting bogus diff on updated date
  results.forEach(s => delete s.date);
  return results;
}

if (global.describe && describe instanceof Function) {
  const { assert } = require('chai');

  describe("Test the crawl doesn't completely fail on a small sample of specs", function() {
    this.slow(10000);
    this.timeout(20000);
    it("doesn't report 3 errors on crawling 3 specs", async() => {
      const refResults = JSON.parse(fs.readFileSync(__dirname + "/crawl-test.json", "utf-8"));
      const results = await crawl();
      for (const result of results) {
        if (result?.ids?.length) {
          result.ids = result.ids.filter(id => !id.match(/\#respec\-/));
        }
      }
      assert.deepEqual(refResults, results);
    });
  });

  describe("The crawler", function() {
    this.slow(10000);
    this.timeout(20000);

    it("supports 'file' URLs", async() => {
      const fileurl = (new URL('crawl-spec.html', `file://${__dirname}/`)).href;
      const results = await crawlList([{
        url: fileurl,
        nightly: { url: fileurl }
      }]);
      assert.equal(results[0].title, 'A test spec');
    });

    it("matches spec shortnames", async() => {
      const output = fs.mkdtempSync(path.join(os.tmpdir(), 'reffy-'));
      const refResults = JSON.parse(fs.readFileSync(__dirname + "/crawl-test.json", "utf-8"))
        .find(res => res.url === 'https://www.w3.org/TR/accelerometer/');
      await crawlSpecs({
        specs: ['accelerometer'],
        output: output
      });
      const results = require(path.resolve(output, 'index.json'));
      assert.equal(refResults.title, results.results[0].title);
    });

    it("interprets filenames relative to the current folder", async() => {
      const output = fs.mkdtempSync(path.join(os.tmpdir(), 'reffy-'));
      await crawlSpecs({
        specs: [path.join(path.relative(process.cwd(), __dirname), 'crawl-spec.html')],
        output: output
      });
      const results = require(path.resolve(output, 'index.json'));
      assert.equal(results.results[0].title, 'A test spec');
    });
  });

  after(() => {
    nock.isDone();
  })
} else if (require.main === module) {
  // when called directly, we update the fixture file used for comparison
  (async function () {
    const results = await crawl();
    fs.writeFileSync(__dirname + "/crawl-test.json", JSON.stringify(results, null, 2), "utf-8");
  })().catch(err => {
    console.error(err);
    process.exit(2);
  });
}
