import { describe, it } from 'node:test';
import assert from 'node:assert';
import annotateLinks from '../src/postprocessing/annotate-links.js';
import { getSchemaValidationFunction } from '../src/lib/util.js';

const speclist = [
  {
    shortname: 'infra',
    nightly: { url: 'https://infra.spec.whatwg.org/' }
  },
  {
    shortname: 'webidl',
    nightly: { url: 'https://webidl.spec.whatwg.org/' }
  },
  {
    shortname: 'css-grid-2',
    release: { url: 'https://www.w3.org/TR/css-grid-2/' },
    nightly: { url: 'https://drafts.csswg.org/css-grid-2/' }
  }
];

function makeSpec() {
  return {
    shortname: 'alpha',
    links: {
      rawlinks: {
        'https://infra.spec.whatwg.org/': { anchors: ['list'] },
        'https://example.org/': {}
      },
      autolinks: {
        'https://webidl.spec.whatwg.org/': { anchors: ['idl-promise'] },
        'https://www.w3.org/TR/css-grid-2/': { anchors: ['grid-container'] }
      }
    }
  };
}

describe('The annotate-links post-processing module', () => {
  it('annotates raw links and autolinks with the shortname of the spec they target', () => {
    const spec = makeSpec();
    annotateLinks.run(spec, { speclist });
    assert.deepStrictEqual(spec.links, {
      rawlinks: {
        'https://infra.spec.whatwg.org/': { anchors: ['list'], specShortname: 'infra' },
        'https://example.org/': {}
      },
      autolinks: {
        'https://webidl.spec.whatwg.org/': { anchors: ['idl-promise'], specShortname: 'webidl' },
        'https://www.w3.org/TR/css-grid-2/': { anchors: ['grid-container'], specShortname: 'css-grid-2' }
      }
    });
  });

  it('produces links that still match the links extract schema', async () => {
    const spec = makeSpec();
    annotateLinks.run(spec, { speclist });
    const validate = await getSchemaValidationFunction('extract-links');
    assert.equal(validate(spec.links), null);
  });

  it('leaves specs without links alone', () => {
    const spec = { shortname: 'alpha' };
    annotateLinks.run(spec, { speclist });
    assert.deepStrictEqual(spec, { shortname: 'alpha' });
  });
});
