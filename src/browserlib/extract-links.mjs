import { canonicalizeUrl } from './canonicalize-url.mjs';

/**
 * Extract and canonicalize absolute links of the document and their fragments
*/
export default function (spec, _, specs) {
  const links = {};
  document.querySelectorAll('a[href^=http]').forEach(n => {
    // Ignore links from the "head" section, which either link to
    // self, the GitHub repo, the implementation report, and other
    // documents that don't need to appear in the list of references.
    if (n.closest('.head')) return;
    const pageUrl = n.href.split('#')[0];
    if (!links[pageUrl]) {
      links[pageUrl] = {anchors: new Set()};
    }
    if (n.href.includes('#') && n.href.split('#')[1]) {
      links[pageUrl].anchors.add(n.href.split('#')[1]);
    }

    // Annotate with the spec to which the page belong if we can find one
    if (Array.isArray(specs)) {
      const specUrl = canonicalizeUrl(pageUrl);
      let matchingSpec = specs.find(s => s?.release?.url === specUrl || s?.nightly?.url === specUrl || (s?.series?.currentSpecification === s?.shortname && (s?.series?.nightlyUrl === specUrl || s?.series?.releaseUrl === specUrl)) || s?.nightly?.pages?.includes(specUrl) || s?.release?.pages?.includes(specUrl));
      if (matchingSpec) {
	links[pageUrl].specShortname = matchingSpec.shortname;
      }
    }
  });
  return Object.keys(links)
    .sort()
  // turning sets into arrays
    .reduce((acc, u) => {
      acc[u] = {specShortname: links[u].specShortname};
      if (links[u].anchors.size > 0) {
	acc[u].anchors = [...links[u].anchors];
      }
      return acc;
  }, {});
}
