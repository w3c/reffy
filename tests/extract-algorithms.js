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
      <p>To be or not to be, given <var>will</var>:</p>
      <dl class="switch">
        <dt>to be</dt>
        <dd>Do something.</dd>
        <dt>not to be</dt>
        <dd>Do nothing.</dd>
      </dl>`,
    algorithms: [
      {
        html: 'To be or not to be, given <var>will</var>:',
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
    title: 'extracts a set of steps when an operation is found (return)',
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
    title: 'extracts a set of steps when an operation is found (throw)',
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

