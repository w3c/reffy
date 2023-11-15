import getAbsoluteUrl from './get-absolute-url.mjs';

/**
 * Extract headings data from documents
*/
export default function (spec, idToHeading) {
  // Compute once whether we created a single page version out of multiple pages
  const singlePage = !document.querySelector('[data-reffy-page]');

  // Headings using the markup convention of the EcmaScript spec
  const esHeadings = [...document.querySelectorAll('emu-clause[id] > h1')].map(n => {
    const headingNumber = n.querySelector(".secnum")?.textContent;
    const headingLevel = headingNumber ? headingNumber.split(".").length : undefined;
    return {
      id: n.parentNode.id,
      href: getAbsoluteUrl(n.parentNode, { singlePage }),
      title: n.textContent.replace(headingNumber, '').trim(),
      level: headingLevel,
      number: headingNumber
    };
  });

  const headingsSelector = [
    ':is(h1,h2,h3,h4,h5,h6)[id]',                 // Regular headings
    ':is(h1,h2,h3,h4,h5,h6):not([id]) > a[name]'  // CSS 2.1 headings
  ].join(',');

  return esHeadings.concat([...document.querySelectorAll(headingsSelector)].map(n => {
    // Note: In theory, all <hX> heading elements that have an ID are associated
    // with a heading in idToHeading. One exception to the rule: when the
    // heading element appears in a <hgroup> element, the mapping is not
    // properly done (the outline creation algorithm explicitly skips these
    // headings not to create a mess in the outline). In practice, this only
    // really happens so far for WHATWG spec titles that (correctly) group the
    // title and subtitle headings in a <hgroup>.
    const idAttr = n.id ? 'id' : 'name';
    const headingEl = n.id ? n : n.parentNode;
    const href = getAbsoluteUrl(n, { singlePage, attribute: idAttr });
    const heading = idToHeading[href] || {
      id: n.getAttribute(idAttr),
      href,
      title: n.textContent.trim()
    };

    const res = {
      id: heading.id,
      href: heading.href,
      level: parseInt(headingEl.tagName.slice(1), 10),
      title: heading.title
    };
    if (heading.number) {
      res.number = heading.number;
    }

    return res;
  }));
}
