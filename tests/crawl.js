const { crawlSpecs } = require("../src/cli/crawl-specs");
const { extractWebrefData } = require("../src/cli/process-specs");
const nock = require('../src/lib/nock-server');
const fs = require("fs");

const specs = [
  {url: "https://www.w3.org/TR/WOFF2/", nightly: {url: "https://w3c.github.io/woff/woff2/", pages:["https://w3c.github.io/woff/woff2/page.html"]}},
  {url: "https://www.w3.org/TR/audio-output/", nightly: {url: "https://w3c.github.io/mediacapture-output/"}},
  {url: "https://www.w3.org/TR/accelerometer/", nightly: {url: "https://w3c.github.io/accelerometer/"}}
];

async function crawl() {
  const results = await crawlSpecs(specs, extractWebrefData) ;
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
      assert.deepEqual(refResults, results);
      nock.isDone();
    });
  });
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
