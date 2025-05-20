import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { rollup } from 'rollup';
import { getSchemaValidationFunction } from '../src/lib/util.js';
const scriptPath = path.dirname(fileURLToPath(import.meta.url));

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
<p><a href="https://dom.spec.whatwg.org/#nodes" data-xref-type="dfn">DOM Standard</a></p>`,
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

  {
    title: "does not extract links in aside dfns panels",
    html: `<h1 id=title>Title</h1>
<ul class="index"><li><aside class="dfn-panel"> <a href="https://dom.spec.whatwg.org/#element">Element</a></aside></li></ul>
<aside class="dfn-panel"><a href="https://dom.spec.whatwg.org/#nodes">Nodes</a></aside>
<div class="dfn-panel" role="dialog" hidden=""><div>
  <a href="https://dom.spec.whatwg.org/#ranges">Permalink</a>
</div></div>`,
    res: {
      autolinks: {},
      rawlinks: {}
    }
  },
];

describe("Links extraction", function () {

  let browser;
  let extractLinksCode;
  let validateSchema;

  before(async () => {
    validateSchema = await getSchemaValidationFunction('extract-links');
    const extractLinksBundle = await rollup({
      input: path.resolve(scriptPath, '../src/browserlib/extract-links.mjs')
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
