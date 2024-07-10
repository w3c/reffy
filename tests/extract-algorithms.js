const assert = require('assert');
const puppeteer = require('puppeteer');
const path = require('path');
const rollup = require('rollup');
const { getSchemaValidationFunction } = require('../src/lib/util');

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
                steps: [ { html: 'Do something.' } ]
              },
              {
                'case': 'not to be',
                steps: [ { html: 'Do nothing.' } ]
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
    title: 'extracts multiple algorithms',
    html: `
      <div>
        <p>To do nothing, run these steps:</p>
        <ol class="algorithm" data-algorithm="my algo" id="algo-id"><li><p>Nothing.</p></li></ol>
      </div>
      <p>To <dfn id="another-algo">do something</dfn>, run these steps:</p>
      <ol><li>Do something.</li></ol>`,
    algorithms: [
      {
        name: 'my algo',
        href: 'about:blank#algo-id',
        html: 'To do nothing, run these steps:',
        rationale: '.algorithm',
        steps: [ { html: '<p>Nothing.</p>' } ]
      },
      {
        name: 'do something',
        href: 'about:blank#another-algo',
        html: 'To <dfn id="another-algo">do something</dfn>, run these steps:',
        rationale: 'do',
        steps: [ { html: 'Do something.' } ]
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
];

describe('The algorithms extraction module', function () {
  this.slow(5000);

  let browser;
  let mapIdsToHeadingsCode;
  let extractAlgorithmsCode;
  const validateSchema = getSchemaValidationFunction('extract-algorithms');

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
    const extractAlgorithmsBundle = await rollup.rollup({
      input: path.resolve(__dirname, '../src/browserlib/extract-algorithms.mjs'),
      onwarn: _ => {}
    });
    const extractAlgorithmsOutput = (await extractAlgorithmsBundle.generate({
      name: 'extractAlgorithms',
      format: 'iife'
    })).output;
    extractAlgorithmsCode = extractAlgorithmsOutput[0].code;

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

  tests.forEach(t => {
    it(t.title, async () => assertExtractedAlgorithms(t.html, t.algorithms, t.spec));
  });


  after(async () => {
    await browser.close();
  });
});

