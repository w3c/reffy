import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { rollup } from 'rollup';
import { getSchemaValidationFunction } from '../src/lib/util.js';
const scriptPath = path.dirname(fileURLToPath(import.meta.url));

const testRefs = [
  {
    title: "extracts normative references",
    html: `
<section>
  <h3>F.1 Normative references</h3>
  <dl>
    <dt id="bib-dom">[dom]</dt>
    <dd><a href="https://dom.spec.whatwg.org/"><cite>DOM Standard</cite></a>. Anne van Kesteren.  WHATWG. Living Standard. URL: <a href="https://dom.spec.whatwg.org/">https://dom.spec.whatwg.org/</a></dd>
  </dl>
</section>`,
    res: {
      normative: [{ name: "dom", url: "https://dom.spec.whatwg.org/" }],
      informative: []
    }
  },

  {
    title: "extracts informative references",
    html: `
<section>
  <h2>F. References</h2>
  <section>
    <h3>F.2 Informative references</h3>
    <dl>
      <dt id="bib-webrtc">[webrtc]</dt>
      <dd><a href="https://www.w3.org/TR/webrtc/"><cite>WebRTC: Real-Time Communication in Browsers</cite></a>. Cullen Jennings; Florent Castelli; Henrik Boström; Jan-Ivar Bruaroey.  W3C. 6 March 2023. W3C Recommendation. URL: <a href="https://www.w3.org/TR/webrtc/">https://www.w3.org/TR/webrtc/</a></dd>
    </dl>
  </section>
</section>`,
    res: {
      normative: [],
      informative: [{ name: "webrtc", url: "https://www.w3.org/TR/webrtc/" }]
    }
  },

  {
    title: "extracts normative/informative references",
    html: `
<section>
  <h2>F. References</h2>
  <section>
    <h3>F.1 Normative references</h3>
    <dl>
      <dt id="bib-dom">[dom]</dt>
      <dd><a href="https://dom.spec.whatwg.org/"><cite>DOM Standard</cite></a>. Anne van Kesteren.  WHATWG. Living Standard. URL: <a href="https://dom.spec.whatwg.org/">https://dom.spec.whatwg.org/</a></dd>
    </dl>
  </section>
  <section>
    <h3>F.2 Informative references</h3>
    <dl>
      <dt id="bib-webrtc">[webrtc]</dt>
      <dd><a href="https://www.w3.org/TR/webrtc/"><cite>WebRTC: Real-Time Communication in Browsers</cite></a>. Cullen Jennings; Florent Castelli; Henrik Boström; Jan-Ivar Bruaroey.  W3C. 6 March 2023. W3C Recommendation. URL: <a href="https://www.w3.org/TR/webrtc/">https://www.w3.org/TR/webrtc/</a></dd>
    </dl>
  </section>
</section>`,
    res: {
      normative: [{ name: "dom", url: "https://dom.spec.whatwg.org/" }],
      informative: [{ name: "webrtc", url: "https://www.w3.org/TR/webrtc/" }]
    }
  },

  {
    title: "extracts a flat list of references",
    html: `
<h2>F. References</h2>
<p>All references are normative unless marked "Non-normative".</p>
<dl>
  <dt id="refsABNF">[ABNF]</dt>
  <dd><cite><a href="https://www.rfc-editor.org/rfc/rfc5234">Augmented BNF for Syntax Specifications: ABNF</a></cite>, D. Crocker, P. Overell. IETF.</dd>
  <dt id="refsAPNG">[APNG]</dt>
  <dd>(Non-normative) <cite><a href="https://wiki.mozilla.org/APNG_Specification">APNG Specification</a></cite>. S. Parmenter, V. Vukicevic, A. Smith. Mozilla.</dd>
</dl>`,
    res: {
      normative: [{ name: "ABNF", url: "https://www.rfc-editor.org/rfc/rfc5234" }],
      informative: [{ name: "APNG", url: "https://wiki.mozilla.org/APNG_Specification" }]
    }
  },

  {
    title: "does not get confused by the absence of sections",
    html: `
<h2>References</h2>
<h3>Normative References</h3>
<dl>
   <dt id="biblio-css-align-3">[CSS-ALIGN-3]</dt>
   <dd>Elika Etemad; Tab Atkins Jr.. <a href="https://drafts.csswg.org/css-align/"><cite>CSS Box Alignment Module Level 3</cite></a>. URL: <a href="https://drafts.csswg.org/css-align/">https://drafts.csswg.org/css-align/</a></dd>
</dl>
<h3>Informative References</h3>
<dl>
  <dt>[CSS-MULTICOL-1]</dt>
  <dd>Florian Rivoal; Rachel Andrew. <a href="https://drafts.csswg.org/css-multicol/"><cite>CSS Multi-column Layout Module Level 1</cite></a>. URL: <a href="https://drafts.csswg.org/css-multicol/">https://drafts.csswg.org/css-multicol/</a></dd>
</dl>`,
    res: {
      normative: [{ name: "CSS-ALIGN-3", url: "https://drafts.csswg.org/css-align/" }],
      informative: [{ name: "CSS-MULTICOL-1", url: "https://drafts.csswg.org/css-multicol/" }]
    }
  },

  {
    title: "does not get confused by further lists",
    html: `
<h2>Normative references</h2>
<p>No references.</p>
<h2>A few terms</h2>
<dl>
   <dt>A term</dt>
   <dd>but not a ref</dd>
</dl>`,
    res: null
  },

  {
    title: "extracts references defined in ul lists",
    html: `
<h2>11 References</h2>
<h3>11.1 Normative References</h3>
<ul>
  <li>
    <p><a href="https://aomediacodec.github.io/av1-spec/av1-spec.pdf">AV1</a> <strong>AV1 Bitstream &amp; Decoding Process Specification, Version 1.0.0 with Errata 1</strong>, January 2019.</p>
  </li>
</ul>
<h3>11.2 Informative References</h3>
<ul>
  <li>
    <p><a href="https://tools.ietf.org/html/rfc3711">RFC3711</a> <strong>The Secure Real-time Transport Protocol (SRTP)</strong>, M. Baugher, D. McGrew, M. Naslund, E. Carrara, and K. Norrman, March 2004.</p>
  </li>
</ul>`,
    res: {
      normative: [{ name: "AV1", url: "https://aomediacodec.github.io/av1-spec/av1-spec.pdf" }],
      informative: [{ name: "RFC3711", url: "https://tools.ietf.org/html/rfc3711" }]
    }
  },

  {
    title: "looks for references in the last candidate section",
    html: `
<h2>Named character references</h2>
<dl>
  <dt>A name</dt>
  <dd>Not a ref</dd>
</dl>
<h2>References</h2>
<dl>
  <dt id="refsABNF">[ABNF]</dt>
  <dd><cite><a href="https://www.rfc-editor.org/rfc/rfc5234">Augmented BNF for Syntax Specifications: ABNF</a></cite>, D. Crocker, P. Overell. IETF.</dd>
  <dt id="refsAPNG">[APNG]</dt>
  <dd>(Non-normative) <cite><a href="https://wiki.mozilla.org/APNG_Specification">APNG Specification</a></cite>. S. Parmenter, V. Vukicevic, A. Smith. Mozilla.</dd>
</dl>`,
    res: {
      normative: [{ name: "ABNF", url: "https://www.rfc-editor.org/rfc/rfc5234" }],
      informative: [{ name: "APNG", url: "https://wiki.mozilla.org/APNG_Specification" }]
    }
  },

  {
    title: "does not extract nested links to sections of a reference",
    html: `
<h2>Normative references</h2>
<ul>
  <li>
    <a href="https://unicode.org/reports/tr35/">Unicode Locale Data Markup Language (LDML)</a>
    <ul>
      <li>
        <a href="https://unicode.org/reports/tr35/#Unicode_Language_and_Locale_Identifiers">Part 1 Core, Section 3 Unicode Language and Locale Identifiers</a>
      </li>
    </ul>
  </li>
</ul>`,
    res: {
      normative: [{ name: "Unicode Locale Data Markup Language (LDML)", url: "https://unicode.org/reports/tr35/" }],
      informative: []
    }
  },

  {
    title: "skips nested references as they usually target subparts of the main reference",
    html: `
<h2>Normative references</h2>
<ul>
  <li>
    RFC3711
    <ul>
      <li><a href="https://tools.ietf.org/html/rfc3711#section-2">RFC3711 - Section 2</a></li>
    </ul>
  </li>
</ul>`,
    res: {
      normative: [{ name: "RFC3711" }],
      informative: []
    }
  },

  {
    title: "finds references in the right section",
    html: `
<h2>  12.1. Normative
  References
</h2>
<dl>
  <dt id="refsABNF">[ABNF]</dt>
  <dd><cite><a href="https://www.rfc-editor.org/rfc/rfc5234">Augmented BNF for Syntax Specifications: ABNF</a></cite>, D. Crocker, P. Overell. IETF.</dd>
</dl>
<h2>C.1 Changes to section 12.1. Normative References</h2>
<dl>
   <dt>A term</dt>
   <dd>but not a ref</dd>
</dl>`,
    res: {
      normative: [{ name: "ABNF", url: "https://www.rfc-editor.org/rfc/rfc5234" }],
      informative: []
    }
  },

  {
    title: "finds 'non-normative' references",
    html: `
<h2>Non-normative references</h2>
<dl>
  <dt>[CSS-MULTICOL-1]</dt>
  <dd>Florian Rivoal; Rachel Andrew. <a href="https://drafts.csswg.org/css-multicol/"><cite>CSS Multi-column Layout Module Level 1</cite></a>. URL: <a href="https://drafts.csswg.org/css-multicol/">https://drafts.csswg.org/css-multicol/</a></dd>
</dl>`,
    res: {
      normative: [],
      informative: [{ name: "CSS-MULTICOL-1", url: "https://drafts.csswg.org/css-multicol/" }]
    }
  },

  {
    title: "extracts normative and informative references from ECMA specs",
    html: `
<emu-clause id="sec-references">
  <h1><span class="secnum">3</span> References</h1>
  <emu-clause id="sec-normative-references">
    <h1><span class="secnum">3.1</span> Normative References</h1>
    <p>
      <a href="https://tc39.es/ecma262/">ECMA-262</a>, <i>ECMAScript® Language Specification</i>.
    </p>
    <p>
      ECMA-404, <i>The JSON Data Interchange Format</i>.<br>
      <a href="https://www.ecma-international.org/publications-and-standards/standards/ecma-404/">https://www.ecma-international.org/publications-and-standards/standards/ecma-404/</a>
    </p>
  </emu-clause>
  <emu-clause id="sec-references-informative">
    <h1><span class="secnum">3.2</span> Informative References</h1>
    <p>
      IETF RFC 4648, <i>The Base16, Base32, and Base64 Data Encodings</i>.<br>
      <a href="https://datatracker.ietf.org/doc/html/rfc4648">https://datatracker.ietf.org/doc/html/rfc4648</a>
    </p>
    <p>
      <i>WebAssembly Core Specification</i>.<br>
      <a href="https://www.w3.org/TR/wasm-core-2/">https://www.w3.org/TR/wasm-core-2/</a>
    </p>
    <p>
      WHATWG <i>Encoding</i>.<br>
      <a href="https://encoding.spec.whatwg.org/">https://encoding.spec.whatwg.org/</a>
    </p>
    <p>
      WHATWG <emu-not-ref><i>Fetch</i></emu-not-ref>.<br>
      <a href="https://fetch.spec.whatwg.org/">https://fetch.spec.whatwg.org/</a>
    </p>
    <p>
      WHATWG <i>Infra</i>.<br>
      <a href="https://infra.spec.whatwg.org/">https://infra.spec.whatwg.org/</a>
    </p>
    <p>
      WHATWG <emu-not-ref><i>URL</i></emu-not-ref>.<br>
      <a href="https://url.spec.whatwg.org/">https://url.spec.whatwg.org/</a>
    </p>
  </emu-clause>
</emu-clause>
`,
    res: {
      normative: [
        { name: "ECMA-262", url: "https://tc39.es/ecma262/" },
        { name: "ECMA-404", url: "https://www.ecma-international.org/publications-and-standards/standards/ecma-404/" }
      ],
      informative: [
        { name: "IETF RFC 4648", url: "https://datatracker.ietf.org/doc/html/rfc4648" },
        { name: "WebAssembly Core Specification", url: "https://www.w3.org/TR/wasm-core-2/" },
        { name: "Encoding", url: "https://encoding.spec.whatwg.org/" },
        { name: "Fetch", url: "https://fetch.spec.whatwg.org/" },
        { name: "Infra", url: "https://infra.spec.whatwg.org/" },
        { name: "URL", url: "https://url.spec.whatwg.org/" }
      ]
    }
  }

];

describe("References extraction", function () {

  let browser;
  let extractRefsCode;
  let validateSchema;

  before(async () => {
    validateSchema = await getSchemaValidationFunction('extract-refs');
    const extractRefsBundle = await rollup({
      input: path.resolve(scriptPath, '../src/browserlib/extract-references.mjs')
    });
    const extractRefsOutput = (await extractRefsBundle.generate({
      name: 'extractRefs',
      format: 'iife'
    })).output;
    extractRefsCode = extractRefsOutput[0].code;

    browser = await puppeteer.launch({ headless: true });
  });

  testRefs.forEach(t => {
    it(t.title, async () => {
      const page = await browser.newPage();
      page.setContent(t.html);
      await page.addScriptTag({ content: extractRefsCode });

      const extractedRefs = await page.evaluate(async () => extractRefs());
      await page.close();
      assert.deepEqual(extractedRefs, t.res);

      if (extractedRefs) {
        const errors = validateSchema(extractedRefs);
        assert.strictEqual(errors, null, JSON.stringify(errors, null, 2));
      }
    });
  });


  after(async () => {
    await browser.close();
  });
});
