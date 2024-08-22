function fromLinksToAnchors(links) {
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

/**
 * Extract absolute links of the document and their fragments
 * in two set: autolinks (generated by spec authoring tools from webref)
 * and rawlinks (the rest)
*/
export default function () {
  const rawlinks = {};
  const autolinks = {};
  document.querySelectorAll('a[href^=http]').forEach(n => {
    // Ignore links from the "head" section, which either link to
    // self, the GitHub repo, the implementation report, and other
    // documents that don't need to appear in the list of references.
    // Also ignore links in <del> elements that appear when specs
    // carry their diff (e.g. W3C Recs with candidate corrections).
    // And then ignore links in aside dfn panels. They only contain internal
    // links or links that already appear elsewhere in the spec.
    if (n.closest('.head, del, .dfn-panel')) return;
    const pageUrl = n.href.split('#')[0];
    // links generated by authoring tools have data-link-type or data-xref-type set
    let linkSet = n.dataset.linkType || n.dataset.xrefType ? autolinks : rawlinks;
    if (!linkSet[pageUrl]) {
      linkSet[pageUrl] = {anchors: new Set()};
    }
    if (n.href.includes('#') && n.href.split('#')[1]) {
      linkSet[pageUrl].anchors.add(n.href.split('#')[1]);
    }
  });
  return {
    rawlinks: fromLinksToAnchors(rawlinks),
    autolinks: fromLinksToAnchors(autolinks)
  };
}
