import { canonicalizeUrl } from './canonicalize-url.js';

/**
 * Extract and canonicalize absolute links of the document
 * FIXME: ⚠ Modify the DOM
*/
export default function () {
  // Ignore links from the "head" section, which either link to
  // self, the GitHub repo, the implementation report, and other
  // documents that don't need to appear in the list of references.
  [...document.querySelectorAll('.head a[href]')].forEach(n => n.href = '');
  const links = new Set([...document.querySelectorAll('a[href^=http]')]
    .map(n => canonicalizeUrl(n.href)));
  return [...links];
}