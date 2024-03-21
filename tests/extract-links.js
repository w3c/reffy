const assert = require('assert');
const puppeteer = require('puppeteer');
const path = require('path');
const rollup = require('rollup');
const { getSchemaValidationFunction } = require('../src/lib/util');

const testLinks = [
  {
    title: "extracts nothing from an spec that does not have any link",
    html: "<h1 id=title>Title</h1>",
    res: {
      autolinks: {},
      rawlinks: {}
    }
  },

  {
    title: "extracts simple raw links",
    html: `<h1 id=title>Title</h1>
<p><a href="https://dom.spec.whatwg.org/">DOM Standard</a></p>`,
    res: {
      autolinks: {},
      rawlinks: {
        "https://dom.spec.whatwg.org/": {}
      }
    }
  },

  {
    title: "extracts simple auto links",
    html: `<h1 id=title>Title</h1>
<p><a href="https://dom.spec.whatwg.org/" data-link-type="spec">DOM Standard</a></p>`,
    res: {
      autolinks: {
        "https://dom.spec.whatwg.org/": {}
      },
      rawlinks: {}
    }
  },

  {
    title: "extracts links with fragments",
    html: `<h1 id=title>Title</h1>
<p><a href="https://dom.spec.whatwg.org/#ranges">DOM Standard</a></p>
<p><a href="https://dom.spec.whatwg.org/#nodes" data-link-type="dfn">DOM Standard</a></p>`,
    res: {
      autolinks: {
        "https://dom.spec.whatwg.org/": {
          "anchors": [
            "nodes"
          ]
        }
      },
      rawlinks: {
        "https://dom.spec.whatwg.org/": {
          "anchors": [
            "ranges"
          ]
        }
      }
    }
  },
];

describe("Links extraction", function () {
  this.slow(5000);

  let browser;
  let extractLinksCode;
  const validateSchema = getSchemaValidationFunction('extract-links');

  before(async () => {
    const extractLinksBundle = await rollup.rollup({
      input: path.resolve(__dirname, '../src/browserlib/extract-links.mjs')
    });
    const extractLinksOutput = (await extractLinksBundle.generate({
      name: 'extractLinks',
      format: 'iife'
    })).output;
    extractLinksCode = extractLinksOutput[0].code;

    browser = await puppeteer.launch({ headless: true });
  });

  testLinks.forEach(t => {
    it(t.title, async () => {
      const page = await browser.newPage();
      page.setContent(t.html);
      await page.addScriptTag({ content: extractLinksCode });

      const extractedLinks = await page.evaluate(async () => extractLinks());
      await page.close();
      assert.deepEqual(extractedLinks, t.res);

      const errors = validateSchema(extractedLinks);
      assert.strictEqual(errors, null, JSON.stringify(errors, null, 2));
    });
  });


  after(async () => {
    await browser.close();
  });
});
