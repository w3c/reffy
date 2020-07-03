/**
 * Extract headings data from documents
*/
export default function () {
  const headings = {};
  return [...document.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id] ,h6[id]')].map(n => {
    return {id: n.id, level: n.tagName.slice(1), title: n.textContent.trim().replace(/^[0-9\.]+ /, '').trim()};
  });
}
