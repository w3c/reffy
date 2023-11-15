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
  },
  {
    title: "encodes the href fragment",
    html: "<h1 id='title-%'>%</h1>",
    res: [{id: "title-%", href: "about:blank#title-%25", title: "%", level: 1}]
  },
  {
    title: "extracts a CSS 2.1 heading at level 1",
    html: "<h1><a name=title>2 Title</a></h1>",
    res: [{id: "title", "href": "about:blank#title", title: "Title", number: "2", level: 1}]
  },
  {
    title: "extracts a CSS 2.1 heading at level 3",
    html: "<h3><a name=title>4.5.1 Title</a></h1>",
    res: [{id: "title", "href": "about:blank#title", title: "Title", number: "4.5.1", level: 3}]
  },
  {
    title: "extracts a CSS 2.1 appendix heading",
    html: "<h1><a name=title>Appendix A. Title</a></h1>",
    res: [{id: "title", "href": "about:blank#title", title: "Title", number: "A", level: 1}]
  },
  {
    title: "extracts an appendix that starts with Appendix and uses ':'",
    html: "<h1 id=title>Appendix A: Title</a></h1>",
    res: [{id: "title", "href": "about:blank#title", title: "Title", number: "A", level: 1}]
  },
  {
    title: "ignores test annotations in the heading",
    html: "<h2 id=title><div class='annotation'>18 tests</div>2.3 Title</a></h2>",
    res: [{id: "title", "href": "about:blank#title", title: "Title", number: "2.3", level: 2}]
  },
  {
    title: "ignores an empty id if there's a better one",
    html: "<section id><h1 id=title>Heading in a section with empty id</h1>",
    res: [{id: "title", "href": "about:blank#title", title: "Heading in a section with empty id", level: 1}]
  },
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
