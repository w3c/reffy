import getAbsoluteUrl from './get-absolute-url.mjs';

/**
 * Extract absolute ids from documents
*/
export default function () {
  // Compute once whether we created a single page version out of multiple pages
  const singlePage = !document.querySelector('[data-reffy-page]');

  return [...document.querySelectorAll('*[id]')]
    // Ignore respec- prefixed ids to avoid keeping track of their evolution
    // They're clearly not meant to be link target in any case
    .filter(n => !n.id.startsWith('respec-'))

    // Ignore dfn-panel- prefixed ids that ReSpec generates to avoid keeping
    // track of their evolution. They're clearly not meant to be link target
    // either.
    .filter(n => !n.id.startsWith('dfn-panel-'))

    // Convert IDs to absolute URLs (needed to handle multipage specs)
    .map(n => getAbsoluteUrl(n, { singlePage }))

    // Capture anchors set in <a name> when they're not dup of ids
    .concat([...document.querySelectorAll('a[name]')]
      .filter(n => !n.id || n.id !== n.name)
      .map(n => getAbsoluteUrl(n, { singlePage, attribute: 'name' }))
    );
}
