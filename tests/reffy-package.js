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
    const clidir = path.join(tmpdir, 'node_modules', 'reffy', 'src', 'cli');
    const { crawlList } = require(path.join(clidir, 'crawl-specs'));
    const refResults = JSON.parse(fs.readFileSync(__dirname + "/crawl-test.json", "utf-8"));
    const results = await crawlList(specs);
    // to avoid reporting bogus diff on updated date
    results.forEach(s => delete s.date);
    assert.deepEqual(refResults, results);
    nock.isDone();
  });

  after(async () => {
    if (tmpdir) {
      await fs.promises.rmdir(tmpdir, { recursive: true });
    }
  });
});