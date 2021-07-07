const { assert } = require('chai');
const puppeteer = require('puppeteer');
const path = require('path');
const rollup = require('rollup');

const testIds = [
  {
    title: "extracts a simple ID",
    html: "<h1 id=title>Title</h1>",
    res: ["about:blank#title"]
  },

  {
    title: "extracts all IDs",
    html: "<h1 id=title>Title <span id=subtitle>Subtitle</span></h1>",
    res: ["about:blank#title", "about:blank#subtitle"]
  },

  {
    title: "excludes IDs that start with respec-",
    html: "<div id=respec-menu>ReSpec menu</div>",
    res: []
  },

  {
    title: "excludes IDs that start with dfn-panel-",
    html: "<div id=dfn-panel-term>ReSpec panel menu</div>",
    res: []
  },

  {
    title: "captures anchors set in <a name>",
    html: "<a name=name>My name</a>",
    res: ["about:blank#name"]
  },

  {
    title: "does not capture name anchors if ID is already set",
    html: "<a id=name name=name>My name</a>",
    res: ["about:blank#name"]
  },

  {
    title: "associates IDs with the right page",
    html: `<section data-reffy-page="https://example.org/page1">
  <p id=first>First page</p>
</section><section data-reffy-page="https://example.org/page2">
  <p id=second>Second page</p>
</section>`,
    res: ["https://example.org/page1#first", "https://example.org/page2#second"]
  }
];

describe("IDs extraction", function () {
  this.slow(5000);

  let browser;
  let extractIdsCode;

  before(async () => {
    const extractIdsBundle = await rollup.rollup({
      input: path.resolve(__dirname, '../src/browserlib/extract-ids.mjs')
    });
    const extractIdsOutput = (await extractIdsBundle.generate({
      name: 'extractIds',
      format: 'iife'
    })).output;
    extractIdsCode = extractIdsOutput[0].code;

    browser = await puppeteer.launch({ headless: true });
  });

  testIds.forEach(t => {
    it(t.title, async () => {
      const page = await browser.newPage();
      page.setContent(t.html);
      await page.addScriptTag({ content: extractIdsCode });

      const extractedIds = await page.evaluate(async () => extractIds());
      await page.close();
      assert.deepEqual(extractedIds, t.res);
    });
  });


  after(async () => {
    await browser.close();
  });
});
