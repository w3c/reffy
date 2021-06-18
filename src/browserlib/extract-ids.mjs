import getAbsoluteUrl from './get-absolute-url.mjs';

/**
 * Extract absolute ids from documents
*/
export default function () {
  // Compute once whether we created a single page version out of multiple pages
  const singlePage = !document.querySelector('[data-reffy-page]');

  return [...document.querySelectorAll('*[id]')]
    .map(n => getAbsoluteUrl(n, { singlePage }))

    // Capture anchors set in <a name> when they're not dup of ids
    .concat([...document.querySelectorAll('a[name]')]
      .filter(n => !n.id || n.id !== n.name).map(n => getAbsoluteUrl(n, { singlePage }))
    )

    // Ignore respec- prefixed ids to avoid keeping track of their evolution
    // They're clearly not meant to be link target in any case
    .filter(id => !id.startsWith('respec-'));
}
