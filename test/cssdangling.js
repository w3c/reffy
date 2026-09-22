import { describe, it } from 'node:test';
import assert from 'node:assert';
import cssdangling from '../src/postprocessing/cssdangling.js';

function dangling(name, href, dfnFor) {
  return { msg: 'Dangling value', name, href, type: 'value', value: name, for: dfnFor };
}

describe('The cssdangling post-processing module', () => {
  it('drops dangling values that apply indirectly through another spec', async () => {
    const crawl = {
      results: [
        {
          shortname: 'sizing',
          css: {
            properties: [], atrules: [], selectors: [], values: [],
            warnings: [
              dangling('stretch', 'https://example.org/sizing#stretch', 'width'),
              dangling('stretch', 'https://example.org/sizing#stretch', 'block-size'),
              dangling('stretch', 'https://example.org/sizing#stretch', 'min-block-size'),
              { msg: 'Missing definition', name: '<foo>' }
            ]
          }
        },
        {
          shortname: 'logical',
          css: {
            properties: [
              { name: 'block-size', value: "<'width'>" },
              { name: 'min-block-size', value: "<'min-width'>" }
            ],
            atrules: [], selectors: [], values: []
          }
        }
      ]
    };
    await cssdangling.run(crawl);
    assert.deepStrictEqual(
      crawl.results[0].css.warnings.map(w => w.for ?? w.msg),
      ['width', 'min-block-size', 'Missing definition']);
  });

  it('follows references transitively and considers non-dangling values', async () => {
    const crawl = {
      results: [
        {
          shortname: 'content',
          css: {
            properties: [], atrules: [], selectors: [],
            values: [{
              name: '<quote>',
              value: 'open-quote',
              values: [{ name: 'open-quote', href: 'https://example.org/content#open-quote' }]
            }],
            warnings: [
              dangling('open-quote', 'https://example.org/content#open-quote', 'content')
            ]
          }
        },
        {
          shortname: 'other',
          css: {
            properties: [{ name: 'content', value: 'normal | <content-list>' }],
            atrules: [], selectors: [],
            values: [{ name: '<content-list>', value: '[ <string> | <quote> ]+' }]
          }
        }
      ]
    };
    await cssdangling.run(crawl);
    assert.strictEqual(crawl.results[0].css.warnings, undefined);
  });
});
