import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { rollup } from 'rollup';
const scriptPath = path.dirname(fileURLToPath(import.meta.url));

const tests = [
  {
    title: 'extracts CDDL from pre.cddl',
    html: `<pre class="cddl">cddl = tstr</pre>`,
    res: 'cddl = tstr'
  },

  {
    title: 'produces no CDDL when there is no CDDL',
    html: `<p>Me no define CDDL</p>`,
    res: []
  },

  {
    title: 'merges multiples blocks of CDDL',
    html: `<pre class="cddl">cddl = * rule</pre>
           <pre class="cddl">rule = tstr</pre>`,
    res: `cddl = * rule

rule = tstr`
  },

  {
    title: 'strips trailing spaces',
    html: `<pre class="cddl">
            cddl = * rule    </pre>`,
    res: `cddl = * rule`
  },

  {
    title: 'preserves internal indentation',
    html: `<pre class="cddl">
            rule = (
              typedef /
              groupdef
            )
            typedef = tstr
              groupdef = tstr
          </pre>`,
    res: `rule = (
  typedef /
  groupdef
)
typedef = tstr
  groupdef = tstr`
  },

  {
    title: 'extracts CDDL module names from data-cddl-module',
    html: `<pre class="cddl" data-cddl-module="mod">cddl = tstr</pre>`,
    res: [
      { name: 'all',    cddl: 'cddl = tstr' },
      { name: 'mod', cddl: 'cddl = tstr' }
    ]
  },

  {
    title: 'extracts CDDL module name defined as class',
    html: `<pre class="cddl mod1-cddl cddl-mod2">cddl = tstr</pre>`,
    res: [
      { name: 'all',  cddl: 'cddl = tstr' },
      { name: 'mod1', cddl: 'cddl = tstr' },
      { name: 'mod2', cddl: 'cddl = tstr' }
    ]
  },

  {
    title: 'assembles CDDL in modules',
    html: `
      <pre class="cddl" data-cddl-module="all">
        rule = (cddl1 / cddl2)
      </pre>
      <pre class="cddl" data-cddl-module="mod1">
        cddl1 = tstr
      </pre>
      <pre class="cddl" data-cddl-module="mod2">
        cddl2 = tstr
      </pre>
      <pre class="cddl">
        typedef = tstr
        groupdef = tstr
      </pre>
    `,
    res: [
      {
        name: 'all',
        cddl:
`rule = (cddl1 / cddl2)

cddl1 = tstr

cddl2 = tstr

typedef = tstr
groupdef = tstr`
      },
      {
        name: 'mod1',
        cddl:
`cddl1 = tstr

typedef = tstr
groupdef = tstr`
      },
      {
        name: 'mod2',
        cddl:
`cddl2 = tstr

typedef = tstr
groupdef = tstr`
      }
    ]
  }
];

function isString(x) {
  return Object.prototype.toString.call(x) === "[object String]";
}

describe("CDDL extraction", function () {
  this.slow(5000);

  let browser;
  let extractCode;

  before(async () => {
    const extractBundle = await rollup({
      input: path.resolve(scriptPath, '../src/browserlib/extract-cddl.mjs')
    });
    const extractOutput = (await extractBundle.generate({
      name: 'extractCddl',
      format: 'iife'
    })).output;
    extractCode = extractOutput[0].code;

    browser = await puppeteer.launch({ headless: true });
  });

  for (const test of tests) {
    it(test.title, async () => {
      const page = await browser.newPage();
      page.setContent(test.html);
      await page.addScriptTag({ content: extractCode });

      const extracted = await page.evaluate(async () => extractCddl());
      await page.close();

      if (isString(test.res)) {
        assert.deepEqual(extracted.length, 1,
          `Expected extraction to return 1 CDDL module, got ${extracted.length}`);
        assert.deepEqual(extracted[0].cddl, test.res);
      }
      else {
        assert.deepEqual(extracted, test.res);
      }
    });
  }

  after(async () => {
    await browser.close();
  });
});
