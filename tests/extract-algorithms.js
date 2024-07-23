import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { rollup } from 'rollup';
import { getSchemaValidationFunction } from '../src/lib/util.js';
const scriptPath = path.dirname(fileURLToPath(import.meta.url));

const tests = [
  {
    title: 'extracts an algorithm marked as such (set of steps)',
    html: `
      <p>To do nothing, run these steps:</p>
      <ol class="algorithm" data-algorithm="my algo" id="algo-id"><li><p>Nothing.</p></li></ol>`,
    algorithms: [
      {
        name: 'my algo',
        href: 'about:blank#algo-id',
        html: 'To do nothing, run these steps:',
        rationale: '.algorithm',
        steps: [ { html: '<p>Nothing.</p>' } ]
      }
    ]
  },

  {
    title: 'extracts an algorithm marked as such (container)',
    html: `
      <div class="algorithm" data-algorithm="my algo" id="algo-id">
        <p>To do nothing, run these steps:</p>
        <ol><li><p>Nothing.</p></li></ol>
      </div>`,
    algorithms: [
      {
        name: 'my algo',
        href: 'about:blank#algo-id',
        html: 'To do nothing, run these steps:',
        rationale: '.algorithm',
        steps: [ { html: '<p>Nothing.</p>' } ]
      }
    ]
  },

  {
    title: 'extracts correct URL for an algorithm in a multi-page spec',
    html: `
      <section data-reffy-page="https://example.com/page1">
        <p>To <dfn id="algo-id">do nothing</dfn>, run these steps:</p>
        <ol class=algorithm><li><p>Nothing.</p></li></ol>
      </div>`,
    algorithms: [
      {
        name: 'do nothing',
        href: 'https://example.com/page1#algo-id',
        html: 'To <dfn id="algo-id">do nothing</dfn>, run these steps:',
        rationale: '.algorithm',
        steps: [ { html: '<p>Nothing.</p>' } ]
      }
    ]
  },
  {
    title: 'extracts one-paragraph algorithms',
    html: `
      <section>
        <p>To <dfn data-export data-dfn-type=dfn id="algo-id">do nothing</dfn>, keep calm and carry on.</p>
      </section>`,
    algorithms: [
      {
        name: 'do nothing',
        href: 'about:blank#algo-id',
        html: 'To <dfn data-export="" data-dfn-type="dfn" id="algo-id">do nothing</dfn>, keep calm and carry on.',
        rationale: 'To <dfn>'
      }
    ]
  },

  {
    title: 'extracts a switch marked as such',
    html: `
      <p>To <dfn id="be">be or not to be</dfn>, given <var>will</var>:</p>
      <dl class="switch">
        <dt>to be</dt>
        <dd>Do something.</dd>
        <dt>not to be</dt>
        <dd>Do nothing.</dd>
      </dl>`,
    algorithms: [
      {
        name: 'be or not to be',
        href: 'about:blank#be',
        html: 'To <dfn id=\"be\">be or not to be</dfn>, given <var>will</var>:',
        rationale: '.switch',
        steps: [
          {
            operation: 'switch',
            steps: [
              {
                'case': 'to be',
                html: 'Do something.'
              },
              {
                'case': 'not to be',
                html: 'Do nothing.'
              }
            ]
          }
        ]
      }
    ]
  },

  {
    title: 'extracts an algorithm when an operation is found (return)',
    html: `
      <ol><li>Return foo.</li></ol>`,
    algorithms: [
      {
        rationale: 'return',
        steps: [ { html: 'Return foo.' } ]
      }
    ]
  },

  {
    title: 'extracts an algorithm when an operation is found (throw)',
    html: `
      <ol>
        <li>To start with, just relax.</li>
        <li>Throw a TooMuchWork exception.</li>
      </ol>`,
    algorithms: [
      {
        rationale: 'throw',
        steps: [
          { html: 'To start with, just relax.' },
          { html: 'Throw a TooMuchWork exception.' }
        ]
      }
    ]
  },

  {
    title: 'extracts multiple algorithms, in document order',
    html: `
      <div>
        <p>To do nothing, run these steps:</p>
        <ol class="algorithm" data-algorithm="my algo" id="algo-id"><li><p>Nothing.</p></li></ol>
      </div>
      <p>To <dfn id=everything data-export data-dfn-type=abstract-op>do everything</dfn>, repeat <a href="#another-algo">do something</a> on everything.</p>
      <p>To <dfn data-export data-dfn-type=dfn id="another-algo">do something</dfn>, run these steps:</p>
      <ol><li>Do something.</li></ol>
      <p>When this method is invoked, run the following steps:</p>
      <ol><li>Do it.</li><li>Stop doing it.</li></ol>
      <p>When this method is invoked, run the following steps:</p>
      <ol><li>Do it carefully.</li><li>Stop doing it at once.</li></ol>`,
    algorithms: [
      {
        name: 'my algo',
        href: 'about:blank#algo-id',
        html: 'To do nothing, run these steps:',
        rationale: '.algorithm',
        steps: [ { html: '<p>Nothing.</p>' } ]
      },
      {
        name: 'do everything',
        href: 'about:blank#everything',
        html: 'To <dfn id="everything" data-export="" data-dfn-type="abstract-op">do everything</dfn>, repeat <a href="about:blank#another-algo">do something</a> on everything.',
        rationale: 'To <dfn>'
      },
      {
        name: 'do something',
        href: 'about:blank#another-algo',
        html: 'To <dfn data-export="" data-dfn-type="dfn" id="another-algo">do something</dfn>, run these steps:',
        rationale: 'do',
        steps: [ { html: 'Do something.' } ]
      },
      {
        html: 'When this method is invoked, run the following steps:',
        rationale: 'do',
        steps: [ { html: 'Do it.' }, { html: 'Stop doing it.' } ]
      },
      {
        html: 'When this method is invoked, run the following steps:',
        rationale: 'do',
        steps: [ { html: 'Do it carefully.' }, { html: 'Stop doing it at once.' } ]
      }
    ]
  },

  {
    title: 'skips the table of contents',
    html: `
      <div class="toc">
        <ol><li>Return foo</li></ol>
      </div>`,
    algorithms: []
  },

  {
    title: 'skips informative algorithms',
    html: `
      <div class="note">
        <ol><li>Return foo</li></ol>
      </div>`,
    algorithms: []
  },

  {
    title: 'reports nested algorithms only once',
    html: `
      <ol class="algorithm">
        <li>
          Run the following steps in parallel:
          <ol class="algorithm"><li>Do good.</li></ol>
        </li>
      </ol>`,
    algorithms: [
      {
        rationale: '.algorithm',
        steps: [
          {
            rationale: '.algorithm',
            html: 'Run the following steps in parallel:',
            steps: [ { html: 'Do good.' } ]
          }
        ]
      }
    ]
  },

  {
    title: 'reports additional steps at the same level',
    html: `
      <ol class="algorithm">
        <li>
          <p>Run the following steps in parallel:</p>
          <ol><li>Do good.</li></ol>
          <p>If that does not do any good, run:</p>
          <ol><li>Do evil.</li></ol>
        </li>
      </ol>`,
    algorithms: [
      {
        rationale: '.algorithm',
        steps: [
          {
            rationale: 'do',
            html: 'Run the following steps in parallel:',
            steps: [ { html: 'Do good.' } ],
            additional: [
              {
                rationale: 'do',
                html: 'If that does not do any good, run:',
                steps: [ { html: 'Do evil.' }]
              }
            ]
          }
        ]
      }
    ]
  },

  {
    title: 'reports sets of steps that were ignored',
    html: `
      <ol class="algorithm">
        <li>
          Run the following steps in parallel:
          <ol><li>Blah</li></ol>
        </li>
        <li>
          Then, run:
          <ol><li>Foo bar</li></ol>
        </li>
      </ol>`,
    algorithms: [
      {
        rationale: '.algorithm',
        steps: [
          {
            html: 'Run the following steps in parallel:',
            ignored: ['Blah']
          },
          {
            html: 'Then, run:',
            ignored: ['Foo bar']
          }
        ]
      }
    ]
  },

  {
    title: 'takes data-algorithm-for into account to namespace an algorithm',
    html: `
      <ol class="algorithm" data-algorithm="hello" data-algorithm-for="world">
        <li>Hello world!</li>
      </ol>
      <ol class="algorithm" data-algorithm="hello" data-algorithm-for="you">
        <li>Hello you!</li>
      </ol>`,
    algorithms: [
      {
        name: 'world/hello',
        rationale: '.algorithm',
        steps: [ { html: 'Hello world!' } ]
      },
      {
        name: 'you/hello',
        rationale: '.algorithm',
        steps: [ { html: 'Hello you!' } ]
      }
    ]
  },

  {
    title: 'captures the first dfn in an algorithm as algorithm name',
    html: `
      <div class="algorithm">
        <p>This is the <dfn data-export="" data-dfn-type="dfn" id="do-something">do something</dfn> algorithm. Please run these steps:</p>
        <p>An annoying paragraph between the actual intro and the steps.</p>
        <ol><li>Do something.</li></ol>
      </div>`,
    algorithms: [
      {
        name: 'do something',
        href: 'about:blank#do-something',
        rationale: '.algorithm',
        html: 'This is the <dfn data-export="" data-dfn-type="dfn" id="do-something">do something</dfn> algorithm. Please run these steps:',
        steps: [ { html: 'Do something.' } ]
      }
    ]
  },

  {
    title: 'ignores a "To <dfn>" algorithm with same name as another algorithm',
    html: `
      <div class="algorithm">
        <p>To <dfn data-export="" data-dfn-type="dfn" id="do-something">do something</dfn>, run these steps:</p>
        <p>An annoying paragraph between the actual intro and the steps.</p>
        <ol><li>Do something.</li></ol>
      </div>`,
    algorithms: [
      {
        name: 'do something',
        href: 'about:blank#do-something',
        rationale: '.algorithm',
        html: 'To <dfn data-export="" data-dfn-type="dfn" id="do-something">do something</dfn>, run these steps:',
        steps: [ { html: 'Do something.' } ]
      }
    ]
  },

  {
    title: 'ignores informative prose when it looks for introductory paragraph',
    html: `
      <p>To <dfn data-export="" data-dfn-type="dfn" id="do-something">do something</dfn>, run these steps:</p>
      <p class="note">Hello there, it's Clippy. How can I be of any help?</p>
      <ol class="algorithm"><li>Do something.</li></ol>
      </div>`,
    algorithms: [
      {
        name: 'do something',
        href: 'about:blank#do-something',
        rationale: '.algorithm',
        html: 'To <dfn data-export="" data-dfn-type="dfn" id="do-something">do something</dfn>, run these steps:',
        steps: [ { html: 'Do something.' } ]
      }
    ]
  },

  {
    title: 'does not return a null href when dfn has no ID',
    html: `
      <p>To <dfn data-export="" data-dfn-type="dfn">do something</dfn>, just do something.</p>`,
    algorithms: [
      {
        name: 'do something',
        rationale: 'To <dfn>',
        html: 'To <dfn data-export="" data-dfn-type="dfn">do something</dfn>, just do something.'
      }
    ]
  },

  {
    title: 'does not get confused by weirdly nested algorithms',
    html: `
      <div class="algorithm">
        <p>To <dfn data-export="" data-dfn-type="dfn" id="do-something">do something</dfn>, run these steps:</p>
        <ol>
          <li>Do something.</li>
          <li>Then run the following steps to <dfn data-export="" data-dfn-type="dfn" id="do-something-else">do something else</dfn>:
            <ol class="algorithm">
              <li>Do something else.</li>
            </ol>
          </li>
        </ol>
      </div>`,
    algorithms: [
      {
        name: 'do something',
        href: 'about:blank#do-something',
        rationale: '.algorithm',
        html: 'To <dfn data-export="" data-dfn-type="dfn" id="do-something">do something</dfn>, run these steps:',
        steps: [
          { html: 'Do something.' },
          {
            html: 'Then run the following steps to <dfn data-export="" data-dfn-type="dfn" id="do-something-else">do something else</dfn>:',
            rationale: '.algorithm',
            steps: [ { html: 'Do something else.' } ]
          }
        ]
      }
    ]
  },

  {
    title: 'uses the list item prose as introductory prose for an algorithm step',
    html: `
      <div class="algorithm">
        <p>To <dfn data-export="" data-dfn-type="dfn" id="do-something">do something</dfn>, run these steps:</p>
        <ol>
          <li>Do something.</li>
          <li>Then run the following steps:
            <ol>
              <li>Do something else.</li>
            </ol>
          </li>
        </ol>
      </div>`,
    algorithms: [
      {
        name: 'do something',
        href: 'about:blank#do-something',
        rationale: '.algorithm',
        html: 'To <dfn data-export="" data-dfn-type="dfn" id="do-something">do something</dfn>, run these steps:',
        steps: [
          { html: 'Do something.' },
          {
            html: 'Then run the following steps:',
            rationale: 'do',
            steps: [ { html: 'Do something else.' } ]
          }
        ]
      }
    ]
  },

  {
    title: 'stops at the first container that has the algorithm name',
    html: `
      <div class="algorithm">
        <p>To <dfn data-export="" data-dfn-type="dfn">do something</dfn>, just do something.</p>
        <div class="algorithm">
          <p>To <dfn data-export="" data-dfn-type="dfn">do something else</dfn>, just do something else.</p>
        </div>
      </div>`,
    algorithms: [
      {
        name: 'do something',
        rationale: 'To <dfn>',
        html: 'To <dfn data-export="" data-dfn-type="dfn">do something</dfn>, just do something.',
      },
      {
        name: 'do something else',
        rationale: 'To <dfn>',
        html: 'To <dfn data-export="" data-dfn-type="dfn">do something else</dfn>, just do something else.',
      }
    ]
  },

  {
    title: 'avoids anchoring on dfns treacherously hidden in algorithm sub-steps',
    html: `
      <div class="algorithm">
        <p>To <dfn data-dfn-type="dfn">do something</dfn>:</p>
        <ol>
          <li>Run the following substeps:
            <ol>
              <li>Do <dfn data-dfn-type="dfn">something</dfn>.</li>
              <li>And something else.</li>
            </ol>
          </li>
        </ol>
      </div>`,
    algorithms: [
      {
        name: 'do something',
        rationale: '.algorithm',
        html: 'To <dfn data-dfn-type="dfn">do something</dfn>:',
        steps: [
          {
            html: 'Run the following substeps:',
            rationale: 'do',
            steps: [
              { html: 'Do <dfn data-dfn-type="dfn">something</dfn>.' },
              { html: 'And something else.' }
            ]
          }
        ]
      }
    ]
  },

];

describe('The algorithms extraction module', function () {
  this.slow(5000);

  let browser;
  let mapIdsToHeadingsCode;
  let extractAlgorithmsCode;
  let validateSchema;

  async function assertExtractedAlgorithms(html, algorithms, spec) {
    const page = await browser.newPage();
    let pageContent = html + `<script>let spec = "${spec}";</script>`;
    page.on('console', message =>
      console.error(`${message.type().substr(0, 3).toUpperCase()} ${message.text()}`));
    page.setContent(pageContent);
    await page.addScriptTag({ content: mapIdsToHeadingsCode });
    await page.addScriptTag({ content: extractAlgorithmsCode });

    const extractedAlgorithms = await page.evaluate(async () => {
      const idToHeading = mapIdsToHeadings();
      return extractAlgorithms(spec, idToHeading);
    });
    await page.close();

    assert.deepEqual(extractedAlgorithms, algorithms);

    const errors = validateSchema(extractedAlgorithms);
    assert.strictEqual(errors, null, JSON.stringify(errors, null, 2));
  }

  before(async () => {
    validateSchema = await getSchemaValidationFunction('extract-algorithms');

    const extractAlgorithmsBundle = await rollup({
      input: path.resolve(scriptPath, '../src/browserlib/extract-algorithms.mjs'),
      onwarn: _ => {}
    });
    const extractAlgorithmsOutput = (await extractAlgorithmsBundle.generate({
      name: 'extractAlgorithms',
      format: 'iife'
    })).output;
    extractAlgorithmsCode = extractAlgorithmsOutput[0].code;

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

  tests.forEach(t => {
    it(t.title, async () => assertExtractedAlgorithms(t.html, t.algorithms, t.spec));
  });


  after(async () => {
    await browser.close();
  });
});

