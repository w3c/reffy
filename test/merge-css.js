import { describe, it } from 'node:test';
import assert from 'node:assert';
import cssmerge from '../src/postprocessing/cssmerge.js';
import crawlTest from './crawl-test.json' with { type: 'json' };

const emptyExtract = {
  atrules: [],
  properties: [],
  selectors: [],
  values: []
};

const emptyMerged = {
  atrules: [],
  functions: [],
  properties: [],
  selectors: [],
  types: []
};

const atrule1 = {
  name: '@-webkit-keyframes',
  href: 'https://compat.spec.whatwg.org/#at-ruledef--webkit-keyframes',
  descriptors: []
};

const atrule2 = {
  name: '@media',
  href: 'https://drafts.csswg.org/css-conditional-3/#at-ruledef-media',
  descriptors: []
};

const descriptor1 = {
  name: 'descriptor1',
  href: 'https://compat.spec.whatwg.org/#descdef-media--webkit-device-pixel-ratio',
  for: '@media',
  value: '<number>',
  type: 'range'
};

const descriptor2 = {
  name: 'descriptor2',
  href: 'https://compat.spec.whatwg.org/#descdef-media--webkit-transform-3d',
  for: '@media',
  value: '<mq-boolean>',
  type: 'discrete'
};

const descriptorBase = {
  name: 'descriptor',
  href: 'https://drafts.csswg.org/css-stuff-1/#descdef-descriptor',
  for: '@media',
  value: 'base',
  type: 'discrete'
};

const descriptorExtension = Object.assign({}, descriptorBase, {
  href: 'https://drafts.csswg.org/css-stuff-2/#descdef-descriptor',
  value: 'extended'
});

const property1 = {
  name: 'overlay',
  href: 'https://drafts.csswg.org/css-position-4/#propdef-overlay',
  value: 'none | auto',
  initial: 'none',
  appliesTo: 'all elements',
  inherited: 'no',
  percentages: 'n/a',
  computedValue: 'as specified',
  canonicalOrder: 'per grammar',
  animationType: 'see prose',
  styleDeclaration: [
    'overlay'
  ]
};

const propertyLegacy = {
  name: 'good-old-overlay',
  href: 'https://compat.spec.whatwg.org/#good-old-overlay',
  legacyAliasOf: 'overlay'
};

const selector1 = {
  name: ':first-of-page',
  href: 'https://drafts.csswg.org/css-gcpm-4/#selectordef-first-of-page',
  value: ':first-of-page'
};

const type1 = {
  name: '<repetition>',
  href: 'https://drafts.csswg.org/css-backgrounds-4/#typedef-repetition',
  type: 'type',
  value: 'repeat | space | round | no-repeat'
};

const type1Extension = {
  name: '<repetition>',
  type: 'type',
  value: 'bis repetita'
};

const functionVar = {
  name: 'var()',
  href: 'https://drafts.csswg.org/css-variables-2/#funcdef-var',
  type: 'function',
  value: 'var( <custom-property-name> , <declaration-value>? )'
};

const functionEnv = {
  name: 'env()',
  href: 'https://drafts.csswg.org/css-env-1/#funcdef-env',
  type: 'function',
  value: 'env( <custom-ident> <integer [0,∞]>*, <declaration-value>? )'
};


/**
 * Consolidation turns `value` keys into `syntax`. We cannot compare
 * the outputs to the inputs directly. This conversion function takes
 * some object or value and converts it to ease comparisons.
 */
function conv(entry, parentKey) {
  const res = {};
  if (typeof entry !== 'object') {
    return entry;
  }
  if (entry.href && !entry.extended && parentKey !== 'descriptors') {
    entry.extended = [];
  }
  for (const [key, value] of Object.entries(entry)) {
    if (Array.isArray(value)) {
      res[key] = value.map(v => conv(v, key));
    }
    else if (key === 'value') {
      res.syntax = value;
    }
    else if (key === 'type' && ['function', 'type'].includes(value)) {
      // Functions and types appear in distinct categories after conversion,
      // the `type` key is not preserved.
    }
    else if (typeof value === 'string' && value.match(/^<([^>]+)>$/)) {
      res[key] = value.slice(1, -1);
    }
    else {
      res[key] = value;
    }
  }
  return res;
}


// Note: Post-processing steps tend to update data in place. That's totally
// fine when they are run as post-processing steps within an actual Reffy crawl
// because Reffy sends a copy of the crawl data to the post-processing module.
// That's problematic for tests because that means the test constructs defined
// above and used across tests may be changed in place. Hence the calls to
// `structuredClone` to force tests to run on copies of test constructs.
describe('CSS extracts consolidation', function () {
  it('generates an empty report when specs do not define CSS', async () => {
    const result = await cssmerge.run({ results: crawlTest });
    assert.deepEqual(result, emptyMerged);
  });


  it('includes all definitions and sorts them', async () => {
    const results = structuredClone([
      {
        shortname: 'css-stuff-1',
        series: { shortname: 'css-stuff' },
        seriesVersion: '1',
        css: Object.assign({}, emptyExtract, {
          atrules: [
            atrule1,
            Object.assign({}, atrule2, {
              descriptors: [descriptor1]
            })
          ],
          selectors: [selector1],
          values: [
            type1,
            functionVar
          ]
        })
      },
      {
        shortname: 'css-otherstuff-1',
        series: { shortname: 'css-otherstuff' },
        seriesVersion: '1',
        css: Object.assign({}, emptyExtract, {
          atrules: [
            Object.assign({}, atrule2, {
              value: '@media <media-query-list> { <rule-list> }',
              descriptors: [descriptor2]
            })
          ],
          properties: [property1],
          values: [functionEnv]
        })
      }
    ]);
    const result = await cssmerge.run({ results });
    const expected = conv({
      atrules: [
        atrule1,
        Object.assign({}, atrule2, {
          value: '@media <media-query-list> { <rule-list> }',
          descriptors: [descriptor1, descriptor2]
        })
      ],
      // Note: env() before var() if code sorts things correctly
      functions: [functionEnv, functionVar],
      properties: [property1],
      selectors: [selector1],
      types: [type1]
    });
    // Note: comparing per category to ease identification of problems if
    // test fails for some reason!

    for (const category of Object.keys(expected)) {
      assert.deepEqual(result[category], expected[category]);
    }
  });


  it('includes nested functions and types', async () => {
    const results = structuredClone([
      {
        shortname: 'css-stuff-1',
        series: { shortname: 'css-stuff' },
        seriesVersion: '1',
        css: Object.assign({}, emptyExtract, {
          values: [
            {
              name: '<track-repeat>',
              href: 'https://drafts.csswg.org/css-grid-2/#typedef-track-repeat',
              type: 'type',
              values: [
                functionEnv,
                type1
              ]
            }
          ]
        })
      }
    ]);
    const result = await cssmerge.run({ results });
    assert.deepEqual(result, conv(Object.assign({}, emptyMerged, {
      functions: [
        Object.assign({}, functionEnv, {
          for: ['<track-repeat>']
        })
      ],
      types: [
        Object.assign({}, type1, {
          for: ['<track-repeat>']
        }),
        {
          name: '<track-repeat>',
          href: 'https://drafts.csswg.org/css-grid-2/#typedef-track-repeat',
          type: 'type'
        }
      ]
    })));
  });


  it('reports the most recent definition in a series', async () => {
    const results = structuredClone([
      {
        shortname: 'css-stuff-1',
        series: { shortname: 'css-stuff' },
        seriesVersion: '1',
        css: Object.assign({}, emptyExtract, {
          properties: [
            property1
          ]
        })
      },
      {
        shortname: 'css-stuff-2',
        series: { shortname: 'css-stuff' },
        seriesVersion: '2',
        css: Object.assign({}, emptyExtract, {
          properties: [
            Object.assign({}, property1, {
              value: 'none | auto | train'
            })
          ]
        })
      }
    ]);
    const result = await cssmerge.run({ results });
    assert.deepEqual(result.properties, [
      Object.assign({}, conv(property1), {
        syntax: 'none | auto | train'
      })
    ]);
  });


  it('merges extended property definitions', async () => {
    const results = structuredClone([
      {
        shortname: 'css-stuff-1',
        series: { shortname: 'css-stuff' },
        seriesVersion: '1',
        css: Object.assign({}, emptyExtract, {
          properties: [
            property1
          ]
        })
      },
      {
        shortname: 'css-otherstuff-2',
        series: { shortname: 'css-otherstuff' },
        seriesVersion: '2',
        css: Object.assign({}, emptyExtract, {
          properties: [
            Object.assign({}, property1, {
              value: null,
              newValues: 'train',
              href: 'https://drafts.csswg.org/css-otherstuff-2/#tchou-tchou'
            })
          ]
        })
      }
    ]);
    const result = await cssmerge.run({ results });
    assert.deepEqual(result.properties, [
      Object.assign({}, conv(property1), {
        syntax: 'none | auto | train',
        extended: ['https://drafts.csswg.org/css-otherstuff-2/#tchou-tchou']
      })
    ]);
  });


  it('discards duplicated property extension definitions', async () => {
    const results = structuredClone([
      {
        shortname: 'css-stuff-1',
        series: { shortname: 'css-stuff' },
        seriesVersion: '1',
        css: Object.assign({}, emptyExtract, {
          properties: [
            property1
          ]
        })
      },
      {
        shortname: 'css-otherstuff-1',
        series: { shortname: 'css-otherstuff' },
        seriesVersion: '1',
        css: Object.assign({}, emptyExtract, {
          properties: [
            Object.assign({}, property1, {
              value: null,
              newValues: 'train',
              href: 'https://drafts.csswg.org/css-otherstuff-1/#tchou-tchou'
            })
          ]
        })
      },
      {
        shortname: 'css-otherstuff-2',
        series: { shortname: 'css-otherstuff' },
        seriesVersion: '2',
        css: Object.assign({}, emptyExtract, {
          properties: [
            Object.assign({}, property1, {
              value: null,
              newValues: 'train',
              href: 'https://drafts.csswg.org/css-otherstuff-2/#tchou-tchou'
            })
          ]
        })
      }
    ]);
    const result = await cssmerge.run({ results });
    assert.deepEqual(result.properties, [
      Object.assign({}, conv(property1), {
        syntax: 'none | auto | train',
        extended: ['https://drafts.csswg.org/css-otherstuff-2/#tchou-tchou']
      })
    ]);
  });


  it('merges at-rules descriptors definitions', async () => {
    const results = structuredClone([
      {
        shortname: 'css-stuff-1',
        series: { shortname: 'css-stuff' },
        seriesVersion: '1',
        css: Object.assign({}, emptyExtract, {
          atrules: [
            Object.assign({}, atrule2, {
              value: '@media foo',
              descriptors: [descriptor1]
            })
          ]
        })
      },
      {
        shortname: 'css-otherstuff-1',
        series: { shortname: 'css-otherstuff' },
        seriesVersion: '1',
        css: Object.assign({}, emptyExtract, {
          atrules: [
            Object.assign({}, atrule2, {
              descriptors: [descriptor2]
            })
          ]
        })
      }
    ]);
    const result = await cssmerge.run({ results });
    assert.deepEqual(result.atrules, [
      conv(Object.assign({}, atrule2, {
        syntax: '@media foo',
        descriptors: [descriptor1, descriptor2]
      }))
    ]);
  });


  it('merges extended at-rules descriptors definitions', async () => {
    const results = structuredClone([
      {
        shortname: 'css-stuff-1',
        series: { shortname: 'css-stuff' },
        seriesVersion: '1',
        css: Object.assign({}, emptyExtract, {
          atrules: [
            Object.assign({}, atrule2, {
              value: '@media foo',
              descriptors: [descriptorBase]
            })
          ]
        })
      },
      {
        shortname: 'css-stuff-2',
        series: { shortname: 'css-stuff' },
        seriesVersion: '2',
        css: Object.assign({}, emptyExtract, {
          atrules: [
            Object.assign({}, atrule2, {
              descriptors: [descriptorExtension]
            })
          ]
        })
      }
    ]);
    const result = await cssmerge.run({ results });
    assert.deepEqual(result.atrules, [
      conv(Object.assign({}, atrule2, {
        syntax: '@media foo',
        descriptors: [descriptorExtension]
      }))
    ]);
  });


  it('discards duplicated descriptor definitions', async () => {
    const results = structuredClone([
      {
        shortname: 'css-stuff-1',
        series: { shortname: 'css-stuff' },
        seriesVersion: '1',
        css: Object.assign({}, emptyExtract, {
          atrules: [
            Object.assign({}, atrule2, {
              value: '@media foo',
              descriptors: [descriptor1]
            })
          ]
        })
      },
      {
        shortname: 'css-otherstuff-1',
        series: { shortname: 'css-otherstuff' },
        seriesVersion: '1',
        css: Object.assign({}, emptyExtract, {
          atrules: [
            Object.assign({}, atrule2, {
              descriptors: [descriptor2]
            })
          ]
        })
      },
      {
        shortname: 'css-otherstuff-2',
        series: { shortname: 'css-otherstuff' },
        seriesVersion: '2',
        css: Object.assign({}, emptyExtract, {
          atrules: [
            Object.assign({}, atrule2, {
              descriptors: [descriptor2]
            })
          ]
        })
      }
    ]);
    const result = await cssmerge.run({ results });
    assert.deepEqual(result.atrules, [
      conv(Object.assign({}, atrule2, {
        syntax: '@media foo',
        descriptors: [descriptor1, descriptor2]
      }))
    ]);
  });


  it('discards scoped definitions that match an unscoped one', async () => {
    const results = structuredClone([
      {
        shortname: 'css-stuff-1',
        series: { shortname: 'css-stuff' },
        seriesVersion: '1',
        css: Object.assign({}, emptyExtract, {
          values: [
            Object.assign({}, type1, {
              values: [
                functionEnv
              ]
            }),
            functionEnv
          ]
        })
      }
    ]);
    const result = await cssmerge.run({ results });
    assert.deepEqual(result, conv(Object.assign({}, emptyMerged, {
      functions: [functionEnv],
      types: [type1]
    })));
  });


  it('sets the syntax of legacy aliases', async () => {
    const results = structuredClone([
      {
        shortname: 'css-stuff-1',
        series: { shortname: 'css-stuff' },
        seriesVersion: '1',
        css: Object.assign({}, emptyExtract, {
          properties: [propertyLegacy]
        })
      },
      {
        shortname: 'css-otherstuff-1',
        series: { shortname: 'css-otherstuff' },
        seriesVersion: '1',
        css: Object.assign({}, emptyExtract, {
          properties: [property1]
        })
      }
    ]);
    const result = await cssmerge.run({ results });
    assert.deepEqual(result.properties, [
      Object.assign({}, conv(propertyLegacy), {
        syntax: property1.value
      }),
      conv(property1)
    ]);
  });

  it('merges scopes when possible', async () => {
    // We'll have 3 definitions of the `env()` functions: one unscoped,
    // another one scoped to two types, and a third one scoped to yet another
    // type. Note syntaxes must differ otherwise merge will drop duplicates.
    const scopedFunctionEnv = Object.assign({}, functionEnv,  {
      href: 'https://drafts.csswg.org/css-first-1/#funcdef-env',
      value: 'env(first)'
    });
    const otherScopedFunctionEnv = Object.assign({}, functionEnv,  {
      href: 'https://drafts.csswg.org/css-second-1/#funcdef-env',
      value: 'env(second)'
    });
    const results = structuredClone([
      {
        shortname: 'css-stuff-1',
        series: { shortname: 'css-stuff' },
        seriesVersion: '1',
        css: Object.assign({}, emptyExtract, {
          values: [
            functionEnv,
            {
              name: '<track-repeat>',
              href: 'https://drafts.csswg.org/css-grid-2/#typedef-track-repeat',
              type: 'type',
              values: [
                scopedFunctionEnv
              ]
            },
            {
              name: '<repeat-ad-libitum>',
              href: 'https://drafts.csswg.org/css-grid-2/#typedef-repeat-ad-libitum',
              type: 'type',
              values: [
                scopedFunctionEnv
              ]
            },
            {
              name: '<another-repeat>',
              href: 'https://drafts.csswg.org/css-grid-2/#typedef-another-repeat',
              type: 'type',
              values: [
                otherScopedFunctionEnv
              ]
            }
          ]
        })
      }
    ]);
    const result = await cssmerge.run({ results });
    assert.deepEqual(result, conv(Object.assign({}, emptyMerged, {
      functions: [
        functionEnv,
        Object.assign({}, otherScopedFunctionEnv, {
          for: ['<another-repeat>']
        }),
        Object.assign({}, scopedFunctionEnv, {
          for: ['<repeat-ad-libitum>', '<track-repeat>']
        }),
      ],
      types: [
        {
          name: 'another-repeat',
          href: 'https://drafts.csswg.org/css-grid-2/#typedef-another-repeat',
          type: 'type'
        },
        {
          name: 'repeat-ad-libitum',
          href: 'https://drafts.csswg.org/css-grid-2/#typedef-repeat-ad-libitum',
          type: 'type'
        },
        {
          name: 'track-repeat',
          href: 'https://drafts.csswg.org/css-grid-2/#typedef-track-repeat',
          type: 'type'
        }
      ]
    })));
  });

  it('merges extended types', async () => {
    const results = structuredClone([
      {
        shortname: 'css-stuff-1',
        series: { shortname: 'css-stuff' },
        seriesVersion: '1',
        crawled: 'https://drafts.csswg.org/css-stuff-1/',
        css: Object.assign({}, emptyExtract, {
          values: [
            Object.assign({}, type1)
          ]
        })
      },
      {
        shortname: 'css-otherstuff-1',
        series: { shortname: 'css-otherstuff' },
        seriesVersion: '1',
        crawled: 'https://drafts.csswg.org/css-otherstuff-1/',
        css: Object.assign({}, emptyExtract, {
          values: [
            Object.assign({}, type1Extension)
          ]
        })
      },
    ]);
    const result = await cssmerge.run({ results });
    assert.deepEqual(result, conv(Object.assign({}, emptyMerged, {
      types: [
        Object.assign({}, conv(type1), {
          syntax: type1Extension.value,
          extended: ['https://drafts.csswg.org/css-otherstuff-1/']
        })
      ]
    })));
  });

  it('discards type extensions without a base definition', async () => {
    const results = structuredClone([
      {
        shortname: 'css-stuff-1',
        series: { shortname: 'css-stuff' },
        seriesVersion: '1',
        css: Object.assign({}, emptyExtract, {
          values: [
            Object.assign({}, type1Extension)
          ]
        })
      }
    ]);
    const result = await cssmerge.run({ results });
    assert.deepEqual(result, conv(emptyMerged));
  });
});
