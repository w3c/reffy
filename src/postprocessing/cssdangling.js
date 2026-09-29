/**
 * Post-processing module that drops dangling values from CSS extracts when
 * these values only apply indirectly to the construct they dangle for.
 *
 * CSS specs tend to list in the "data-dfn-for" attribute of a value both the
 * constructs to which the value applies directly and the constructs to which
 * the value applies indirectly. The CSS extraction logic only keeps the former
 * but only knows about constructs defined in the spec being crawled. For
 * instance, css-sizing-4 defines "stretch" for "width" and "block-size". The
 * extraction logic cannot tell that "block-size" is defined in css-logical-1
 * as "<'width'>", and reports "stretch" for "block-size" as a dangling value.
 *
 * With all CSS extracts at hand, the module drops such dangling values.
 *
 * Module runs at the crawl level and updates CSS extracts in place.
 */

import fs from 'node:fs';
import path from 'node:path';
import { shouldSaveToFile } from '../lib/util.js';


/**
 * Return the names of the constructs that the given value syntax references,
 * using the same naming conventions as in CSS extracts: "<'width'>" references
 * the property "width", "<length [0,∞]>" references the type "<length>", and
 * "fit-content(" references the function "fit-content()".
 */
function getReferencedNames(syntax) {
  const names = [];
  for (const match of syntax.matchAll(/<'([^']+)'>/g)) {
    names.push(match[1]);
  }
  for (const match of syntax.matchAll(/<([a-zA-Z0-9-]+)(?:\s[^>]*)?>/g)) {
    names.push(`<${match[1]}>`);
  }
  for (const match of syntax.matchAll(/([a-zA-Z0-9-]+)\(/g)) {
    names.push(`${match[1]}()`);
  }
  return names;
}


export default {
  dependsOn: ['css'],
  input: 'crawl',

  run: async function (crawl, options) {
    const extracts = crawl.results.filter(spec =>
      spec.css && (typeof spec.css !== 'string'));

    // Index constructs that each construct references in its value syntax,
    // across all CSS extracts. Note: this is purely name-based, scoped types
    // and functions get merged with unscoped ones.
    const references = new Map();
    function indexConstruct(construct) {
      for (const syntax of [construct.value, construct.newValues]) {
        if (!syntax) {
          continue;
        }
        if (!references.has(construct.name)) {
          references.set(construct.name, new Set());
        }
        for (const name of getReferencedNames(syntax)) {
          references.get(construct.name).add(name);
        }
      }
      for (const value of construct.values ?? []) {
        indexConstruct(value);
      }
      for (const descriptor of construct.descriptors ?? []) {
        indexConstruct(descriptor);
      }
    }
    for (const spec of extracts) {
      for (const category of ['properties', 'atrules', 'selectors', 'values']) {
        for (const construct of spec.css[category] ?? []) {
          indexConstruct(construct);
        }
      }
    }

    // Walk references breadth-first (there may be cycles)
    function isAncestorOf(ancestor, child) {
      const seen = new Set([ancestor]);
      const queue = [ancestor];
      while (queue.length > 0) {
        for (const name of references.get(queue.shift()) ?? []) {
          if (name === child) {
            return true;
          }
          if (!seen.has(name)) {
            seen.add(name);
            queue.push(name);
          }
        }
      }
      return false;
    }

    for (const spec of extracts) {
      const dangling = (spec.css.warnings ?? [])
        .filter(warning => warning.msg === 'Dangling value');
      if (dangling.length === 0) {
        continue;
      }

      // Rebuild the list of constructs for which each value is defined, from
      // the constructs that have the value and from dangling values
      const valueFor = new Map();
      function addValueFor(href, name) {
        if (!valueFor.has(href)) {
          valueFor.set(href, []);
        }
        valueFor.get(href).push(name);
      }
      function indexValues(construct) {
        for (const value of construct.values ?? []) {
          addValueFor(value.href, construct.name);
          indexValues(value);
        }
        for (const descriptor of construct.descriptors ?? []) {
          indexValues(descriptor);
        }
      }
      for (const category of ['properties', 'atrules', 'selectors', 'values']) {
        for (const construct of spec.css[category] ?? []) {
          indexValues(construct);
        }
      }
      for (const warning of dangling) {
        addValueFor(warning.href, warning.for);
      }

      // Drop dangling values for constructs that reference another construct
      // for which the value is also defined
      const indirect = dangling.filter(warning =>
        valueFor.get(warning.href).find(name =>
          name !== warning.for && isAncestorOf(warning.for, name)));
      if (indirect.length === 0) {
        continue;
      }
      spec.css.warnings = spec.css.warnings
        .filter(warning => !indirect.includes(warning));
      if (spec.css.warnings.length === 0) {
        delete spec.css.warnings;
      }
    }

    return crawl;
  },

  save: async function (crawl, options) {
    if (!shouldSaveToFile(options)) {
      return;
    }

    // Retrieve the paths to the CSS extracts from the index.json file
    // (spec.css was expanded)
    const indexFilename = path.join(options.output, 'index.json');
    const index = JSON.parse(await fs.promises.readFile(indexFilename, 'utf8'));
    for (const spec of crawl.results) {
      if (!spec.css || (typeof spec.css === 'string')) {
        continue;
      }
      const specInIndex = index.results.find(s => s.shortname === spec.shortname);
      const css = Object.assign({
        spec: {
          title: spec.title,
          url: spec.crawled
        }
      }, spec.css);
      await fs.promises.writeFile(
        path.join(options.output, specInIndex.css),
        JSON.stringify(css, null, 2) + '\n');
    }
  }
};
