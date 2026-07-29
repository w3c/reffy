import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { rollup } from 'rollup';
import { getSchemaValidationFunction } from '../src/lib/util.js';
const scriptPath = path.dirname(fileURLToPath(import.meta.url));

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
  {
    title: "documents alternate ids when they exist",
    html: "<section id=title-0><h1 id=title>Heading in a section with its own id</h1>",
    res: [{id: "title-0", "href": "about:blank#title-0", title: "Heading in a section with its own id", level: 1, alternateIds: ["title"]}]
  },
  {
    title: "deals with headings in www.rfc-editor.org RFCs",
    html: `<pre>
      <span class="h2">
        <a class="selflink" id="title" href="#title">2</a>.
        Title
      </span>
    </pre>`,
    res: [{id: "title", href: "about:blank#title", title: "Title", number: "2", level: 1}]
  },
  {
    title: "deals with sub-headings in www.rfc-editor.org RFCs",
    html: `<pre>
      <span class="h3">
        <a class="selflink" id="title" href="#title">3.1</a>.
        Title
      </span>
    </pre>`,
    res: [{id: "title", href: "about:blank#title", title: "Title", number: "3.1", level: 2}]
  },
  {
    title: "deals with appendices in www.rfc-editor.org RFCs",
    html: `<pre>
      <span class="h3">
        <a class="selflink" id="title" href="#title">Appendix A</a>.
        Title
      </span>
    </pre>`,
    res: [{id: "title", href: "about:blank#title", title: "Title", number: "A", level: 1}]
  },
  {
    title: "documents alternate IDs in WebGL1",
    html: `
      <h2 id="5.2">
        <span class="secno">5.2</span>
        <a name="WEBGLCONTEXTATTRIBUTES">WebGLContextAttributes</a>
      </h2>
    `,
    res: [{id: "5.2", href: "about:blank#5.2", title: "WebGLContextAttributes", number: "5.2", level: 2, alternateIds: ["WEBGLCONTEXTATTRIBUTES"]}]
  },
  {
    title: "documents empty span alternate IDs before a section heading",
    html: `
      <section id="globals">
        <span id="syntax-global"></span>
        <span id="index-4①"></span>
        <h4 class="heading settled" id="globals①">
          <span class="secno">2.5.4. </span>
          <span class="content">Globals</span>
        </h4>
      </section>
    `,
    res: [{
      id: "globals",
      href: "about:blank#globals",
      title: "Globals",
      number: "2.5.4",
      level: 4,
      alternateIds: ["globals①", "syntax-global", "index-4①"]
    }]
  },
  {
    title: "documents oldids and empty span alternate IDs in ECMAScript clauses",
    html: `
      <emu-clause id="sec-%iterator.prototype%-object" oldids="sec-%iteratorprototype%-object">
        <span id="sec-%iteratorprototype%-object"></span>
        <h1>
          <span class="secnum">27.1.3.3</span>
          Properties of the Iterator Prototype Object
        </h1>
      </emu-clause>
    `,
    res: [{
      id: "sec-%iterator.prototype%-object",
      href: "about:blank#sec-%25iterator.prototype%25-object",
      title: "Properties of the Iterator Prototype Object",
      number: "27.1.3.3",
      level: 4,
      alternateIds: ["sec-%iteratorprototype%-object"]
    }]
  }
];

describe("Test headings extraction", function () {

  let browser;
  let extractHeadingsCode;
  let mapIdsToHeadingsCode;
  let validateSchema;

  before(async () => {
    validateSchema = await getSchemaValidationFunction('extract-headings');
    const extractHeadingsBundle = await rollup({
      input: path.resolve(scriptPath, '../src/browserlib/extract-headings.mjs')
    });
    const extractHeadingsOutput = (await extractHeadingsBundle.generate({
      name: 'extractHeadings',
      format: 'iife'
    })).output;
    extractHeadingsCode = extractHeadingsOutput[0].code;

    const mapIdsToHeadingsBundle = await rollup({
      input: path.resolve(scriptPath, '../src/browserlib/map-ids-to-headings.mjs')
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
