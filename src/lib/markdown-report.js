/**
 * Helper function to generate a short report of a crawl in GitHub Markdown
 * for a spec that features a summary of the crawl result, and details in
 * expandable details sections about elements worthy of interest (such as CSS
 * properties, exported definitions, Web IDL interfaces, etc.).
 *
 * The markdown does not contain titles on purpose so that it can be embedded
 * as is in a larger Markdown context (e.g., a GitHub issue that looks at a
 * spec from various perspectives).
 */

import reffyModules from '../browserlib/reffy.json' with { type: 'json' };
import idlparsed from '../postprocessing/idlparsed.js';


/**
 * For each module, we need to know how to detect whether Reffy actually
 * extracted something from the spec, how to summarize the results when it
 * did, and whether/how to highlight specific details.
 *
 * TODO: reffy.json and the browserlib structure could be refactored to bind
 * all the logic linked to a module together: how to extract, whether something
 * was extracted, how to summarize, etc. (but note the extraction logic actually
 * runs in a browser page, while the rest runs in a Node.js context and that,
 * for IDL, interesting info is returned by the idlparsed post-processing
 * module)
 */
const moduleFunctions = {
  algorithms: {
    isPresent: isArrayPresent,
    summary: arrayInfo
  },
  cddl: {
    isPresent: isArrayPresent,
    summary: value => 'found'
  },
  css: {
    isPresent: value => ['properties', 'atrules', 'selectors', 'values']
      .find(prop => isArrayPresent(value?.[prop])),
    summary: value => ['properties', 'atrules', 'selectors', 'values']
      .map(prop => value[prop]?.length > 0 ?
        value[prop].length + ' ' + getCSSLabel(prop, value[prop].length) :
        null)
      .filter(found => found)
      .join(', '),
    details: value => ['properties', 'atrules', 'selectors']
      .map(prop => {
        if (!isArrayPresent(value[prop])) {
          return null;
        }
        const types = [
          'css-at-rule',
          'css-descriptor',
          'css-function',
          'css-property',
          'css-selector',
          'css-type',
          'css-value'
        ].join(',')
        const details = value[prop]
          .map(val => '- ' + wrapTerm(val.name, 'css type', val.href) +
            ` ([xref search](https://respec.org/xref/?term=${encodeURIComponent(val.name)}&types=${encodeURIComponent(types)}))`
          );
        if (details.length === 0) {
          return null;
        }
        const report = ['<details>'];
        report.push(`<summary>${details.length} CSS ${getCSSLabel(prop, details.length)}</summary>`);
        report.push('');
        report.push(...details);
        report.push('</details>');
        return report.join('\n');
      })
      .filter(details => !!details)
      .join('\n')
  },
  dfns: {
    isPresent: isArrayPresent,
    summary: value => {
      const access = {};
      for (const dfn of value) {
        if (!access[dfn.access]) {
          access[dfn.access] = [];
        }
        access[dfn.access].push(dfn);
      }
      return Object.entries(access)
        .map(([access, dfns]) => dfns.length > 0 ?
          dfns.length + ' ' + access :
          null)
        .filter(found => found)
        .join(', ');
    },
    details: value => {
      const details = value
        .filter(dfn => dfn.access === 'public')
        .map(dfn => '- ' + wrapTerm(dfn.linkingText[0], dfn.type, dfn.href) +
          (dfn.for?.length > 0 ? ' for ' + wrapTerm(dfn.for[0], dfn.type) : '') +
          `, type ${dfn.type}` +
          ` ([xref search](https://respec.org/xref/?term=${encodeURIComponent(dfn.linkingText[0])}))`
        );
      if (details.length === 0) {
        return null;
      }
      const s = details.length > 1 ? 's' : '';
      const report = ['<details>'];
      report.push(`<summary>${details.length} exported term${s}</summary>`);
      report.push('');
      report.push(...details);
      report.push('</details>');
      return report.join('\n');
    }
  },
  events: {
    isPresent: isArrayPresent,
    summary: arrayInfo
  },
  headings: {
    isPresent: isArrayPresent,
    summary: arrayInfo
  },
  idl: {
    // Note: For IDL, we're more interested in the info that gets produced by the
    // idlparsed post-processing module (which gets run automatically if it
    // did not run during crawl)
    // For extended names, exclude names that the spec itself defines
    // (they will be reported as names defined by the spec already)
    isPresent: value => (typeof value === 'string') && value.length > 0,
    summary: (value, spec) => {
      const parsedIdl = spec.idlparsed;
      if (typeof parsedIdl === 'string') {
        return 'invalid Web IDL found';
      }
      const res = [];
      const idlNames = Object.keys(parsedIdl.idlNames)
        .concat(Object.keys(parsedIdl.idlExtendedNames)
          .filter(name => !parsedIdl.idlNames[name]));
      if (idlNames.length > 0) {
        const s = idlNames.length > 1 ? 's' : '';
        res.push(`${idlNames.length} name${s} (or partial${s})`);
      }
      const globals = Object.keys(parsedIdl.globals);
      if (globals.length > 0) {
        const s = globals.length > 1 ? 's' : '';
        res.push(`${globals.length} global${s}`);
      }
      return res.join(', ');
    },
    details: (value, spec) => {
      const parsedIdl = spec.idlparsed;
      if (typeof parsedIdl === 'string') {
        return null;
      }

      const report = [];

      const idlNames = Object.keys(parsedIdl.idlNames);
      if (idlNames.length > 0) {
        const s = idlNames.length > 1 ? 's' : '';
        report.push('<details>');
        report.push(`<summary>${idlNames.length} Web IDL name${s}</summary>`);
        report.push('');
        for (const name of idlNames) {
          const type = parsedIdl.idlNames[name].type;
          report.push('- ' + type + ' ' +
            wrapTerm(name, type, parsedIdl.idlNames[name].href) +
            ` ([xref search](https://respec.org/xref/?term=${encodeURIComponent(name)}&types=_IDL_))`);
        }
        report.push('</details>');
      }

      const idlExtendedNames = Object.keys(parsedIdl.idlExtendedNames)
        .filter(name => !parsedIdl.idlNames[name]);
      if (idlExtendedNames.length > 0) {
        const s = idlExtendedNames.length > 1 ? 's' : '';
        report.push('<details>');
        report.push(`<summary>${idlExtendedNames.length} extended Web IDL name${s}</summary>`);
        report.push('');
        for (const name of idlExtendedNames) {
          const type = parsedIdl.idlExtendedNames[name][0].type;
          report.push('- ' + type + ' ' +
            wrapTerm(name, type, parsedIdl.idlExtendedNames[name][0].href) +
            ` ([xref search](https://respec.org/xref/?term=${encodeURIComponent(name)}&types=_IDL_))`);
        }
        report.push('</details>');
      }

      const globals = Object.keys(parsedIdl.globals);
      if (globals.length > 0) {
        const s = globals.length > 1 ? 's' : '';
        report.push('<details>');
        report.push(`<summary>${globals.length} Web IDL global${s}</summary>`);
        report.push('');
        for (const glob of globals) {
          report.push(`- \`${glob}\``);
        }
        report.push('</details>');
      }

      return report.join('\n');
    }
  },
  ids: {
    isPresent: isArrayPresent,
    summary: arrayInfo
  },
  links: {
    isPresent: isArrayPresent,
    summary: value => ['rawlinks', 'autolinks']
      .map(prop => Object.keys(value[prop]).length > 0 ?
        Object.keys(value[prop]).length + ' ' + prop :
        null)
      .filter(found => found)
      .join(', ')
  },
  refs: {
    isPresent: value =>
      isArrayPresent(value?.normative) ||
      isArrayPresent(value?.informative),
    summary: value => ['normative', 'informative']
      .map(prop => value[prop].length > 0 ?
        value[prop].length + ' ' + prop :
        null)
      .filter(found => found)
      .join(', ')
  }
};


/**
 * Return true if the given value is an array that contains at least one item.
 */
function isArrayPresent(value) {
  return Array.isArray(value) && value.length > 0;
}


/**
 * Return the number of items found in the array
 */
function arrayInfo(value) {
  return value.length + ' found';
}

function wrapTerm(term, type, href) {
  let res = '';
  if (type === 'abstract-op' || type === 'dfn') {
    res = term;
  }
  else {
    res = '`' + term + '`';
  }
  if (href) {
    return `[${res}](${href})`;
  }
  else {
    return res;
  }
}

function getCSSLabel(prop, nb) {
  switch (prop) {
  case 'atrules':
    return nb > 1 ? 'at-rules' : 'at-rule';
  case 'properties':
    return nb > 1 ? 'properties' : 'property';
  case 'selectors':
    return nb > 1 ? 'selectors' : 'selector';
  case 'values':
    return nb > 1 ? 'values': 'value';
  }
}


/**
 * Return a Markdown string that summarizes the given spec crawl results
 */
export async function generateSpecReport(specResult) {
  // Start report with a summary on spec metadata, adding URLs as needed
  const summary = [];
  for (const mod of reffyModules) {
    if (!mod.metadata) {
      continue;
    }
    if (specResult[mod.property]) {
      summary.push(`- ${mod.label}: ${specResult[mod.property]}`);
    }
  }
  summary.push(`- Canonical URL: [${specResult.url}](${specResult.url})`);
  if (specResult.crawled && specResult.crawled !== specResult.url) {
    summary.push(`- Crawled URL: [${specResult.crawled}](${specResult.crawled})`);
  }

  // If the spec defines IDL, run the idlparsed post-processing module
  if (specResult.idl && !specResult.idlparsed) {
    await idlparsed.run(specResult);
  }

  // Add summary of extracts found and not found
  const extractModules = reffyModules
    .filter(mod => !mod.metadata && moduleFunctions[mod.property])
    .map(mod => Object.assign(mod, moduleFunctions[mod.property]));
  const extractsSummary = [];
  const missingSummary = [];
  for (const mod of extractModules) {
    const value = specResult[mod.property];
    if (mod.isPresent(value)) {
      extractsSummary.push(`  - ${mod.label}: ${mod.summary(value, specResult)}`);
    }
    else {
      missingSummary.push(mod.label);
    }
  }
  if (extractsSummary.length > 0) {
    summary.push(`- Spec defines:`);
    summary.push(...extractsSummary);
  }
  if (missingSummary.length > 0) {
    missingSummary.sort();
    summary.push(`- No ${missingSummary.join(', ')} definitions found`);
  }

  // End of summary, look at possible details of interest
  const details = [];
  for (const mod of extractModules) {
    const value = specResult[mod.property];
    if (!mod.details || !mod.isPresent(value)) {
      continue;
    }
    const modDetails = mod.details(value, specResult);
    if (modDetails) {
      details.push(modDetails);
    }
  }

  const report = [];
  report.push('Crawl summary:');
  report.push(...summary);
  if (details.length > 0) {
    report.push('');
    report.push(...details);
  }
  return report.join('\n');
}