const { assert } = require('chai');
const puppeteer = require('puppeteer');
const path = require('path');
const rollup = require('rollup');

const testIds = [
  {
    title: "extracts Web IDL from pre.idl",
    html: `<h1 id=title>Title</h1>
<pre class="idl">interface GreatIdl {}</pre>`,
    res: 'interface GreatIdl {}'
  },

  {
    title: "extracts Web IDL from pre > code.idl-code",
    html: `<h1 id=title>Title</h1>
<pre><code class="idl-code">interface GreatIdl {}</code></pre>`,
    res: 'interface GreatIdl {}'
  },

  {
    title: "extracts Web IDL from pre > code.idl",
    html: `<h1 id=title>Title</h1>
<pre><code class="idl">interface GreatIdl {}</code></pre>`,
    res: 'interface GreatIdl {}'
  },

  {
    title: "extracts Web IDL from div.idl-code > pre",
    html: `<h1 id=title>Title</h1>
<div class="idl-code"><pre>interface GreatIdl {}</pre></div>`,
    res: 'interface GreatIdl {}'
  },

  {
    title: "extracts Web IDL from pre.widl",
    html: `<h1 id=title>Title</h1>
<pre class="widl">interface GreatIdl {}</pre>`,
    res: 'interface GreatIdl {}'
  },

  {
    title: "combines Web IDL defined in multiple blocks",
    html: `<h1 id=title>Title</h1>
<pre class="idl">interface GreatIdl {}</pre>
<pre><code class="idl">interface GreatIdl2 {}</code></pre>
<div class="idl-code"><pre>interface GreatIdl3 {}</pre></div>
<pre class="widl">interface GreatIdl4 {}</pre>`,
    res: `interface GreatIdl {}

interface GreatIdl2 {}

interface GreatIdl3 {}

interface GreatIdl4 {}`
  },

  {
    title: "ignores Web IDL defined with .exclude",
    html: `<h1 id=title>Title</h1>
<pre class="idl exclude">interface GreatIdl {}</pre>
<pre class="exclude"><code class="idl">interface GreatIdl {}</code></pre>
<pre><code class="idl exclude">interface GreatIdl {}</code></pre>
<div class="idl-code exclude"><pre>interface GreatIdl {}</pre></div>
<div class="idl-code"><pre class="exclude">interface GreatIdl {}</pre></div>
<pre class="widl exclude">interface GreatIdl {}</pre>`,
    res: ''
  },

  {
    title: "ignores Web IDL defined with .extract",
    html: `<h1 id=title>Title</h1>
<pre class="idl extract">interface GreatIdl {}</pre>
<pre class="extract"><code class="idl">interface GreatIdl {}</code></pre>
<pre><code class="idl extract">interface GreatIdl {}</code></pre>
<div class="idl-code extract"><pre>interface GreatIdl {}</pre></div>
<div class="idl-code"><pre class="extract">interface GreatIdl {}</pre></div>
<pre class="widl extract">interface GreatIdl {}</pre>`,
    res: ''
  },

  {
    title: "trims trailing spaces",
    html: `<h1 id=title>Title</h1>
<pre class="idl">interface GreatIdl {}  </pre>`,
    res: 'interface GreatIdl {}'
  },

  {
    title: "replaces tabs with spaces",
    html: `<h1 id=title>Title</h1>
<pre class="idl">interface GreatIdl {
\tboolean amIGreat();\t
}</pre>`,
    res: `interface GreatIdl {
  boolean amIGreat();
}`
  },

  {
    title: "ignores the Web IDL index by default",
    html: `<h1 id=title>Title</h1>
<div id="idl-index"><pre class="idl">interface GreatIdl {}</pre></div>`,
    res: ''
  },

  {
    title: "uses the Web IDL index in Bikeshed specs",
    html: `<meta name="generator" content="Bikeshed" />
<h1 id=title>Title</h1>
<pre class="idl">interface GreatIdl {}</pre>
<h2 id="idl-index">IDL index</h2>index
<pre class="idl">interface GreatIdl {}</pre>`,
    res: 'interface GreatIdl {}'
  },

  {
    title: "ignores any embedded header",
    html: `<h1 id=title>Title</h1>
<pre class="idl">
  <div class="idlHeader">Look at this great IDL</div>
  interface GreatIdl {}
  <div class="idlHeader">There will be more</div>
</pre>`,
    res: 'interface GreatIdl {}'
  },

  {
    title: "ignores links to tests",
    html: `<h1 id=title>Title</h1>
<pre class="idl">
  interface <details class="respec-tests-details"><summary>3 tests</summary>See WPT</details>GreatIdl {}
  interface <details class="respec-tests-details"><summary>2 tests</summary>See WPT</details>AnotherGreatIdl {}
</pre>`,
    res: `interface GreatIdl {}
interface AnotherGreatIdl {}`
  },

  {
    title: "ignores asides",
    html: `<h1 id=title>Title</h1>
<pre class="idl">
  interface GreatIdl<aside>The interface is referenced from...</aside> {}</pre>`,
    res: 'interface GreatIdl {}'
  }
];

describe("Web IDL extraction", function () {
  this.slow(5000);

  let browser;
  let extractCode;

  before(async () => {
    const extractBundle = await rollup.rollup({
      input: path.resolve(__dirname, '../src/browserlib/extract-webidl.mjs')
    });
    const extractOutput = (await extractBundle.generate({
      name: 'extractIdl',
      format: 'iife'
    })).output;
    extractCode = extractOutput[0].code;

    browser = await puppeteer.launch({ headless: true });
  });

  testIds.forEach(t => {
    it(t.title, async () => {
      const page = await browser.newPage();
      page.setContent(t.html);
      await page.addScriptTag({ content: extractCode });

      const extracted = await page.evaluate(async () => extractIdl());
      await page.close();
      assert.deepEqual(extracted, t.res);
    });
  });


  after(async () => {
    await browser.close();
  });
});
