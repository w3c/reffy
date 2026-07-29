import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import backrefs from '../src/postprocessing/backrefs.js';
import { getSchemaValidationFunction } from '../src/lib/util.js';

function makeDfn({ id, href, linkingText, type = 'dfn', for: dfnFor = [], access = 'public' }) {
  return {
    id,
    href,
    linkingText: Array.isArray(linkingText) ? linkingText : [linkingText ?? id],
    type,
    for: dfnFor,
    access
  };
}

function makeLinks(fragmentUrls) {
  const rawlinks = {};
  for (const url of fragmentUrls) {
    const [base, frag] = url.split('#');
    if (!rawlinks[base]) {
      rawlinks[base] = { anchors: [] };
    }
    if (frag) {
      rawlinks[base].anchors.push(frag);
    }
  }
  return { rawlinks, autolinks: {} };
}

function makeSpec({ shortname, title, url, dfns = [], links = null }) {
  return {
    shortname,
    title,
    url,
    crawled: url,
    nightly: { url },
    dfns,
    links
  };
}

describe('The backrefs post-processing module', () => {
  it('leaves specs without externally referenced dfns without backrefs', async () => {
    const crawl = {
      results: [
        makeSpec({
          shortname: 'alpha',
          title: 'Alpha',
          url: 'https://example.org/alpha/',
          dfns: [
            makeDfn({
              id: 'lonely',
              href: 'https://example.org/alpha/#lonely',
              linkingText: 'lonely'
            })
          ]
        }),
        makeSpec({
          shortname: 'beta',
          title: 'Beta',
          url: 'https://example.org/beta/',
          links: makeLinks(['https://example.org/beta/#self'])
        })
      ]
    };

    await backrefs.run(crawl, {});
    assert.equal(crawl.results[0].backrefs, undefined);
    assert.equal(crawl.results[1].backrefs, undefined);
  });

  it('records external references and excludes self-references', async () => {
    const crawl = {
      results: [
        makeSpec({
          shortname: 'streams',
          title: 'Streams Standard',
          url: 'https://streams.spec.whatwg.org/',
          dfns: [
            makeDfn({
              id: 'readablestream',
              href: 'https://streams.spec.whatwg.org/#readablestream',
              linkingText: 'ReadableStream',
              type: 'interface'
            }),
            makeDfn({
              id: 'unreferenced',
              href: 'https://streams.spec.whatwg.org/#unreferenced',
              linkingText: 'unreferenced'
            })
          ],
          links: makeLinks([
            'https://streams.spec.whatwg.org/#readablestream'
          ])
        }),
        makeSpec({
          shortname: 'fetch',
          title: 'Fetch Standard',
          url: 'https://fetch.spec.whatwg.org/',
          links: makeLinks([
            'https://streams.spec.whatwg.org/#readablestream'
          ])
        })
      ]
    };

    await backrefs.run(crawl, {});

    assert.equal(crawl.results[1].backrefs, undefined);
    assert.deepEqual(crawl.results[0].backrefs, [
      {
        id: 'readablestream',
        href: 'https://streams.spec.whatwg.org/#readablestream',
        linkingText: ['ReadableStream'],
        type: 'interface',
        for: [],
        access: 'public',
        referencedBy: [
          {
            shortname: 'fetch',
            title: 'Fetch Standard',
            url: 'https://fetch.spec.whatwg.org/'
          }
        ]
      }
    ]);
  });

  it('preserves definition and referrer document order', async () => {
    const crawl = {
      results: [
        makeSpec({
          shortname: 'defining',
          title: 'Defining Spec',
          url: 'https://example.org/defining/',
          dfns: [
            makeDfn({
              id: 'zebra',
              href: 'https://example.org/defining/#zebra',
              linkingText: 'zebra'
            }),
            makeDfn({
              id: 'apple',
              href: 'https://example.org/defining/#apple',
              linkingText: 'apple'
            })
          ]
        }),
        makeSpec({
          shortname: 'zeta',
          title: 'Zeta',
          url: 'https://example.org/zeta/',
          links: makeLinks([
            'https://example.org/defining/#zebra',
            'https://example.org/defining/#apple'
          ])
        }),
        makeSpec({
          shortname: 'alpha',
          title: 'Alpha',
          url: 'https://example.org/alpha/',
          links: makeLinks([
            'https://example.org/defining/#zebra',
            'https://example.org/defining/#apple'
          ])
        })
      ]
    };

    await backrefs.run(crawl, {});
    const terms = crawl.results[0].backrefs;
    assert.deepEqual(terms.map(t => t.id), ['zebra', 'apple']);
    assert.deepEqual(
      terms[0].referencedBy.map(r => r.shortname),
      ['zeta', 'alpha']
    );
  });

  it('includes private dfns and copies for/access fields', async () => {
    const crawl = {
      results: [
        makeSpec({
          shortname: 'defining',
          title: 'Defining Spec',
          url: 'https://example.org/defining/',
          dfns: [
            makeDfn({
              id: 'secret-method',
              href: 'https://example.org/defining/#secret-method',
              linkingText: 'secret()',
              type: 'method',
              for: ['SecretInterface'],
              access: 'private'
            })
          ]
        }),
        makeSpec({
          shortname: 'referrer',
          title: 'Referrer Spec',
          url: 'https://example.org/referrer/',
          links: makeLinks(['https://example.org/defining/#secret-method'])
        })
      ]
    };

    await backrefs.run(crawl, {});
    assert.deepEqual(crawl.results[0].backrefs, [
      {
        id: 'secret-method',
        href: 'https://example.org/defining/#secret-method',
        linkingText: ['secret()'],
        type: 'method',
        for: ['SecretInterface'],
        access: 'private',
        referencedBy: [
          {
            shortname: 'referrer',
            title: 'Referrer Spec',
            url: 'https://example.org/referrer/'
          }
        ]
      }
    ]);
  });

  it('matches multipage HTML links against single-page dfn hrefs', async () => {
    const crawl = {
      results: [
        makeSpec({
          shortname: 'html',
          title: 'HTML Standard',
          url: 'https://html.spec.whatwg.org/multipage/',
          dfns: [
            makeDfn({
              id: 'dom-document',
              href: 'https://html.spec.whatwg.org/multipage/dom.html#dom-document',
              linkingText: 'Document',
              type: 'interface'
            })
          ]
        }),
        makeSpec({
          shortname: 'dom',
          title: 'DOM Standard',
          url: 'https://dom.spec.whatwg.org/',
          links: makeLinks(['https://html.spec.whatwg.org/#dom-document'])
        })
      ]
    };

    await backrefs.run(crawl, {});
    assert.equal(crawl.results[0].backrefs.length, 1);
    assert.equal(
      crawl.results[0].backrefs[0].referencedBy[0].shortname,
      'dom'
    );
  });

  it('saves per-spec extracts and updates index.json', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'reffy-backrefs-'));
    try {
      const crawl = {
        results: [
          makeSpec({
            shortname: 'streams',
            title: 'Streams Standard',
            url: 'https://streams.spec.whatwg.org/',
            dfns: [
              makeDfn({
                id: 'readablestream',
                href: 'https://streams.spec.whatwg.org/#readablestream',
                linkingText: 'ReadableStream',
                type: 'interface'
              })
            ]
          }),
          makeSpec({
            shortname: 'fetch',
            title: 'Fetch Standard',
            url: 'https://fetch.spec.whatwg.org/',
            links: makeLinks([
              'https://streams.spec.whatwg.org/#readablestream'
            ])
          })
        ]
      };

      await backrefs.run(crawl, {});
      await fs.writeFile(
        path.join(tmp, 'index.json'),
        JSON.stringify({
          results: crawl.results.map(spec => ({
            shortname: spec.shortname,
            title: spec.title
          }))
        }, null, 2)
      );

      await backrefs.save(crawl, { output: tmp });

      const extractPath = path.join(tmp, 'backrefs', 'streams.json');
      const extract = JSON.parse(await fs.readFile(extractPath, 'utf8'));
      assert.deepEqual(extract.spec, {
        title: 'Streams Standard',
        url: 'https://streams.spec.whatwg.org/'
      });
      assert.equal(extract.backrefs.length, 1);
      assert.equal(crawl.results[0].backrefs, 'backrefs/streams.json');

      const index = JSON.parse(await fs.readFile(path.join(tmp, 'index.json'), 'utf8'));
      assert.equal(index.results[0].backrefs, 'backrefs/streams.json');
      assert.equal(index.results[1].backrefs, undefined);

      const validate = await getSchemaValidationFunction('backrefs');
      assert.equal(typeof validate, 'function');
      assert.equal(validate(extract), null);
    }
    finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
