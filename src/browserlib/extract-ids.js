/**
 * Extract ids from documents
*/
export default function () {
  return [...document.querySelectorAll('*[id]')].map(n => n.id).concat(
    // Capture anchors set in <a name> when they're not dup of ids
    [...document.querySelectorAll('a[name]')]
      .filter(n => !n.id || n.id !== n.name).map(n => n.name)
    // We ignore respec- prefixed ids to avoid keeping track of their evolution
    // They're clearly not meant to be link target in any case
  ).filter(id => !id.startsWith('respec-'));
}
