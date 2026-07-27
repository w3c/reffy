/**
 * Post-processing module that creates back references extracts per spec. A
 * back references extract contains all terms defined in a spec that are
 * referenced by other specs, along with the list of specs that reference the
 * term.
 *
 * The module runs at the crawl level.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createFolderIfNeeded, shouldSaveToFile } from '../lib/util.js';


/**
 * Definition of the post-processing module
 */
export default {
  dependsOn: ['dfns', 'links'],
  input: 'crawl',

  run: async function (crawl, options) {
    // href → { definingShortname, dfn }
    const linksIndex = new Map();
    // definingShortname → Map(dfnHref → { dfn fields, referencedBy: Map })
    const byDefiningSpec = new Map();

    for (const spec of crawl.results) {
      for (const dfn of (spec.dfns || [])) {
        const entry = {
          definingShortname: spec.shortname,
          dfn
        };
        indexDfnHref(linksIndex, dfn.href, entry);

        if (!byDefiningSpec.has(spec.shortname)) {
          byDefiningSpec.set(spec.shortname, {
            spec,
            terms: new Map()
          });
        }
        const terms = byDefiningSpec.get(spec.shortname).terms;
        if (!terms.has(dfn.href)) {
          terms.set(dfn.href, {
            id: dfn.id,
            href: dfn.href,
            linkingText: dfn.linkingText,
            type: dfn.type,
            for: dfn.for,
            access: dfn.access,
            referencedBy: new Map()
          });
        }
      }
    }

    for (const spec of crawl.results) {
      const referrer = {
        shortname: spec.shortname,
        title: spec.title,
        url: spec.nightly?.url || spec.crawled || spec.url
      };
      for (const link of expandFragmentLinks(spec)) {
        let match = null;
        for (const form of alternateLinkForms(link)) {
          match = linksIndex.get(form);
          if (match) {
            break;
          }
        }
        if (!match) {
          continue;
        }
        // Exclude self-references
        if (match.definingShortname === spec.shortname) {
          continue;
        }
        const bucket = byDefiningSpec.get(match.definingShortname);
        const term = bucket?.terms.get(match.dfn.href);
        if (!term) {
          continue;
        }
        if (!term.referencedBy.has(referrer.shortname)) {
          term.referencedBy.set(referrer.shortname, referrer);
        }
      }
    }

    for (const spec of crawl.results) {
      const terms = byDefiningSpec.get(spec.shortname)?.terms;
      if (!terms) {
        delete spec.backrefs;
        continue;
      }

      // Note: need to convert Maps to regular arrays for serialization
      const backrefs = [...terms.values()]
        .filter(term => term.referencedBy.size > 0);
      if (backrefs.length === 0) {
        delete spec.backrefs;
        continue;
      }

      for (const backref of backrefs) {
        backref.referencedBy = [...backref.referencedBy.values()];
      }
      spec.backrefs = backrefs;
    }

    return crawl;
  },

  save: async function (crawl, options) {
    if (!shouldSaveToFile(options)) {
      return;
    }

    function getBaseJSON(spec) {
      return {
        spec: {
          title: spec.title,
          url: spec.crawled
        }
      };
    }

    const folder = path.join(options.output, 'backrefs');
    await createFolderIfNeeded(folder);

    // Create backrefs extracts
    for (const spec of crawl.results) {
      if (!spec.backrefs) {
        continue;
      }

      const contents = getBaseJSON(spec);
      contents.backrefs = spec.backrefs;
      const json = JSON.stringify(contents, null, 2);
      const filename = path.join(folder, spec.shortname + '.json');
      await fs.promises.writeFile(filename, json);
      spec.backrefs = `backrefs/${spec.shortname}.json`;
    }

    // Re-generate index.json file
    // (starting from saved file because we expanded a few properties)
    const indexFilename = path.join(options.output, 'index.json');
    const index = JSON.parse(await fs.promises.readFile(indexFilename, 'utf8'));
    for (const specInIndex of index.results) {
      const spec = crawl.results.find(spec => spec.shortname === specInIndex.shortname);
      if (spec.backrefs) {
        specInIndex.backrefs = spec.backrefs;
      }
      else {
        delete specInIndex.backrefs;
      }
    }
    await fs.promises.writeFile(indexFilename, JSON.stringify(index, null, 2));
  }
};



/**
 * Index a dfn href and HTML/ECMAScript multipage ↔ single-page aliases.
 */
function indexDfnHref(linksIndex, href, entry) {
  linksIndex.set(href, entry);
  if (href.startsWith('https://html.spec.whatwg.org/multipage/') ||
      href.startsWith('https://tc39.es/ecma262/multipage/')) {
    const singlePageUrl = href.replace(/\/multipage\/[^#]+#/, '/#');
    linksIndex.set(singlePageUrl, entry);
  }
}


/**
 * Expand a referring spec's links extracts into absolute fragment URLs.
 */
function expandFragmentLinks(spec) {
  const links = spec.links;
  if (!links) {
    return [];
  }
  const bases = new Set([
    ...Object.keys(links.rawlinks || {}),
    ...Object.keys(links.autolinks || {})
  ]);
  const fullLinks = [];
  for (const link of bases) {
    const anchors = [
      ...(links.rawlinks?.[link]?.anchors || []),
      ...(links.autolinks?.[link]?.anchors || [])
    ];
    for (const frag of anchors) {
      fullLinks.push(`${link}#${frag}`);
    }
  }
  return [...new Set(fullLinks)];
}


/**
 * Normalize multipage HTML/ES links to the single-page form used by many dfns.
 */
function alternateLinkForms(link) {
  const forms = [link];
  if (link.startsWith('https://html.spec.whatwg.org/multipage/') ||
      link.startsWith('https://tc39.es/ecma262/multipage/')) {
    forms.push(link.replace(/\/multipage\/[^#]+#/, '/#'));
  }
  return forms;
}