import { canonicalizeUrl } from './canonicalize-url.js';

/**
 * Extract and canonicalize absolute links of the document and their fragments
 * FIXME: ⚠ Modify the DOM
*/
export default function () {
  // Ignore links from the "head" section, which either link to
  // self, the GitHub repo, the implementation report, and other
  // documents that don't need to appear in the list of references.
  const links = {};
  [...document.querySelectorAll('.head a[href]')].forEach(n => n.href = '');
  document.querySelectorAll('a[href^=http]').forEach(n => {
    const url = canonicalizeUrl(n.href);
    if (!links[url]) {
      links[url] = new Set();
    }
    if (n.href.includes('#') && n.href.split('#')[1]) {
      links[url].add(n.href.split('#')[1]);
    }
  });
  return Object.keys(links)
  // turning sets into arrays
    .reduce((acc, u) => {
      acc[u] = [...links[u]];
      return acc;
  }, {});
}
