const { assert } = require('chai');
const puppeteer = require('puppeteer');
const path = require('path');
const rollup = require('rollup');
const { getSchemaValidationFunction } = require('../src/lib/util');

const testHeadings = [
  {
    title: "extracts a simple heading",
    html: "<h1 id=title>Title</h1>",
    res: [{id: "title", href: "about:blank#title", title: "Title", level: 1}]
  },
  {
    title: "ignores a heading without id",
    html: "<h1>Heading without id</h1>",
    res: []
  },
  {
    title: "extracts a heading title without its section number",
    html: "<h2 id=title>2.3 Title</h2>",
    res: [{id: "title", href: "about:blank#title", title: "Title", number: "2.3", level: 2}]
  }
];

describe("Test headings extraction", function () {
  this.slow(5000);

  let browser;
  let extractDefinitionsCode;
  let mapIdsToHeadingsCode;
  const validateSchema = getSchemaValidationFunction('extract-headings');

  before(async () => {
    const extractHeadingsBundle = await rollup.rollup({
      input: path.resolve(__dirname, '../src/browserlib/extract-headings.mjs')
    });
    const extractHeadingsOutput = (await extractHeadingsBundle.generate({
      name: 'extractHeadings',
      format: 'iife'
    })).output;
    extractHeadingsCode = extractHeadingsOutput[0].code;

    const mapIdsToHeadingsBundle = await rollup.rollup({
      input: path.resolve(__dirname, '../src/browserlib/map-ids-to-headings.mjs')
    });
    const mapIdsToHeadingsOutput = (await mapIdsToHeadingsBundle.generate({
      name: 'mapIdsToHeadings',
      format: 'iife'
    })).output;
    mapIdsToHeadingsCode = mapIdsToHeadingsOutput[0].code;

    browser = await puppeteer.launch({ headless: true });
  });

  testHeadings.forEach(t => {
    it(t.title, async () => {
      const page = await browser.newPage();
      page.setContent(t.html);
      await page.addScriptTag({ content: extractHeadingsCode });
      await page.addScriptTag({ content: mapIdsToHeadingsCode });

      const extractedHeadings = await page.evaluate(async () => {
        const idToHeading = mapIdsToHeadings();
        return extractHeadings('', idToHeading);
      });
      await page.close();
      assert.deepEqual(extractedHeadings, t.res);

      const errors = validateSchema(extractedHeadings);
      assert.strictEqual(errors, null, JSON.stringify(errors, null, 2));
    });
  });


  after(async () => {
    await browser.close();
  });
});
