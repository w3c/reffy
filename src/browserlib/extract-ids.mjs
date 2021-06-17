/**
 * Extract absolute ids from documents
*/
export default function () {
  // Compute once whether we created a single page version out of multiple pages
  const isMultipage = !!document.querySelector('[data-reffy-page]');

  function getAbsoluteUrl(node) {
    const page = isMultipage ?
      node.closest('[data-reffy-page]')?.getAttribute('data-reffy-page') :
      null;
    const url = new URL(page ?? window.location.href);
    url.hash = '#' + node.id;
    return url.toString();
  }

  return [...document.querySelectorAll('*[id]')]
    .map(n => getAbsoluteUrl(n))

    // Capture anchors set in <a name> when they're not dup of ids
    .concat([...document.querySelectorAll('a[name]')]
      .filter(n => !n.id || n.id !== n.name).map(n => getAbsoluteUrl(n))
    )

    // I respec- prefixed ids to avoid keeping track of their evolution
    // They're clearly not meant to be link target in any case
    .filter(id => !id.startsWith('respec-'));
}
