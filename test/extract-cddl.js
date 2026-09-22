import { describe, it, before, after } from 'node:test';
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
    title: 'excludes CDDL generated in the Bikeshed CDDL index section',
    html: `<pre class="cddl">real = tstr</pre>

           <h2 id="cddl-index">CDDL Index</h2>
           <h3>Remote end definition</h3>
           <pre class="cddl">real = tstr</pre>
           <h3>Local end definition</h3>
           <pre class="cddl">real = tstr</pre>

           <h2 id="something-else">Next section</h2>
           <pre class="cddl">other = tstr</pre>`,
    res: `real = tstr

other = tstr`
  },

  {
    title: 'excludes CDDL in a container with the CDDL index ID',
    html: `<pre class="cddl">real = tstr</pre>
           <div id="cddl-index">
             <h2>CDDL Index</h2>
             <pre class="cddl">real = tstr</pre>
           </div>
           <pre class="cddl">other = tstr</pre>`,
    res: `real = tstr

other = tstr`
  },

  {
    title: 'excludes CDDL in index subsections wrapped in section elements',
    html: `<section><pre class="cddl">real = tstr</pre></section>
           <section>
             <h2 id="cddl-index">CDDL Index</h2>
             <section><h3>Remote end definition</h3><pre class="cddl">real = tstr</pre></section>
           </section>
           <section><h2>Next</h2><pre class="cddl">other = tstr</pre></section>`,
    res: `real = tstr

other = tstr`
  },

  {
    title: 'does not exclude CDDL modules from an index without modules',
    html: `<pre class="cddl" data-cddl-module="mod">cddl = tstr</pre>
           <h2 id="cddl-index">CDDL Index</h2>
           <pre class="cddl">cddl = tstr</pre>`,
    res: [
      { name: 'all', cddl: 'cddl = tstr' },
      { name: 'mod', cddl: 'cddl = tstr' }
    ]
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
  },

  {
    title: 'strips the header that ReSpec adds to CDDL blocks',
    html: `<pre class="cddl def highlight" id="cddl-block-1"><span class="cddlHeader"><a class="self-link" href="#cddl-block-1">CDDL</a></span><code><dfn data-dfn-type="cddl-type" id="cddl-type-foo-bar" data-export="">foo.Bar</dfn> <span class="cddl-op">=</span> <span>tstr</span></code></pre>`,
    res: 'foo.Bar = tstr'
  }
];

function isString(x) {
  return Object.prototype.toString.call(x) === "[object String]";
}

describe("CDDL extraction", function () {

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
