/**
 * Extract absolute links of the document and their fragments
*/
export default function () {
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
  });
  return Object.keys(links)
    .sort()
  // turning sets into arrays
    .reduce((acc, u) => {
      acc[u] = {};
      if (links[u].anchors.size > 0) {
	acc[u].anchors = [...links[u].anchors];
      }
      return acc;
  }, {});
}
