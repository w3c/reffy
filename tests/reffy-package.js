const { assert } = require("chai");
const os = require("os");
const fs = require("fs");
const path = require("path");
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const nock = require('../src/lib/nock-server');

const specs = [
  {url: "https://www.w3.org/TR/WOFF2/", nightly: {url: "https://w3c.github.io/woff/woff2/", pages:["https://w3c.github.io/woff/woff2/page.html"]}},
  {url: "https://www.w3.org/TR/audio-output/", nightly: {url: "https://w3c.github.io/mediacapture-output/"}},
  {url: "https://www.w3.org/TR/accelerometer/", nightly: {url: "https://w3c.github.io/accelerometer/"}}
];

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("The npm package of Reffy", function () {
  this.slow(30000);
  this.timeout(60000);

  let tmpdir;

  before(async () => {
    tmpdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reffy-'));
    const reffydir = path.resolve(__dirname, "..");
    const { stdout: reffyPackage } = await exec(`npm pack "${reffydir}"`, { cwd: tmpdir});
    await exec(`npm install ${reffyPackage.trim()}`, { cwd: tmpdir });
  });

  it("can crawl specs", async () => {
    const clidir = path.join(tmpdir, 'node_modules', 'reffy', 'src', 'lib');
    const { crawlList } = require(path.join(clidir, 'specs-crawler'));
    const refResults = JSON.parse(fs.readFileSync(__dirname + "/crawl-test.json", "utf-8"));
    const results = await crawlList(specs, { forceLocalFetch: true });
    for (const result of results) {
      if (result?.ids?.length) {
        result.ids = result.ids.filter(id => !id.match(/\#respec\-/));
      }
    }
    // to avoid reporting bogus diff on updated date
    results.forEach(s => delete s.date);
    assert.deepEqual(refResults, results);
  });

  after(async () => {
    if (tmpdir) {
      // The Chrome instance ran by Puppeteer may keep a handle on a few tmp
      // files, let's give it some time to release the handles so that we can
      // delete the tmp folder
      await sleep(1000);
      try {
        await fs.promises.rmdir(tmpdir, { recursive: true });
      } catch {}
    }
  });
});