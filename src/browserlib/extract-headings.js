/**
 * Extract headings data from documents
*/
export default function (idToHeading) {
  return [...document.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id] ,h6[id]')].map(n => {
    // Note: In theory, all <hX> heading elements that have an ID are associated
    // with a heading in idToHeading. One exception to the rule: when the
    // heading element appears in a <hgroup> element, the mapping is not
    // properly done (the outline creation algorithm explicitly skips these
    // headings not to create a mess in the outline). In practice, this only
    // really happens so far for WHATWG spec titles that (correctly) group the
    // title and subtitle headings in a <hgroup>.
    const heading = idToHeading[n.id] || {
      id: n.id,
      title: n.textContent.trim()
    };
    const res = {
      id: heading.id,
      level: parseInt(n.tagName.slice(1), 10),
      title: heading.title
    };

    if (heading.number) {
      res.number = heading.number;
    }

    return res;
  });
}
