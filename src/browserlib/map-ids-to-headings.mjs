import createOutline from './create-outline.mjs';
import getAbsoluteUrl from './get-absolute-url.mjs';

/**
 * Generate a mapping between elements that have an ID and the closest heading
 * (that also has an ID) under which these elements appear in the DOM tree.
 *
 * The main difficulty is that the structure of a DOM tree does not necessarily
 * follow the structure of the outline of the document, which means that there
 * is no direct way to tell the conceptual section where an element is defined
 * just by looking at its list of ancestors in the DOM tree.
 *
 * In practice, the outline of the document needs to be prepared accordingly to
 * the HTML spec before the mapping can be done.
 *
 * @function
 * @public
 * @return {Object} A mapping table, where keys are IDs of all elements in the
 *   document, and values are IDs of the heading elements under which these
 *   elements are defined. The table only contains IDs for which there exists
 *   such a heading.
 */
export default function () {
  // Regular expression to capture the numbering of a heading. The expression
  // extracts numbers such as "1.", "A.", "A.3", "13.3.4.". Note: a top-level
  // number always ends with a ".", but there may be no final "." in sublevels
  // (Bikeshed adds one, ReSpec does not).
  const reNumber = /^([A-Z0-9]\.|[A-Z](\.[0-9]+)+\.?|[0-9]+(\.[0-9]+)+\.?)\s/;

  // Get a flat list of all conceptual sections
  function flattenSections(outline) {
    return outline
      .concat(outline.flatMap(section => flattenSections(section.subSections)))
      .concat(outline.flatMap(section => flattenSections(section.subRoots)));
  }

  const { outline, nodeToSection } = createOutline(document.body);
  const sections = flattenSections(outline);

  // Compute once whether we created a single page version out of multiple pages
  const singlePage = !document.querySelector('[data-reffy-page]');

  const mappingTable = {};
  [...document.querySelectorAll('[id]')].forEach(node => {
    let parentSection = nodeToSection.get(node);
    while (parentSection) {
      if (parentSection.heading !== '__implied') {
        break;
      }
      parentSection = sections.find(section =>
        section.subSections.includes(parentSection) ||
        section.subRoots.includes(parentSection));
    }

    // Compute the absolute URL with fragment
    // (Note the crawler merges pages of a multi-page spec in the first page
    // to ease parsing logic, and we want to get back to the URL of the page)
    const nodeid = getAbsoluteUrl(node, { singlePage });
    let href = nodeid;

    if (parentSection) {
      const heading = parentSection.heading;
      let id = heading.id;
      href = getAbsoluteUrl(heading, { singlePage });

      if (parentSection.root && parentSection.root.hasAttribute('id')) {
        id = parentSection.root.id;
        href = getAbsoluteUrl(parentSection.root, { singlePage });
      }

      const trimmedText = heading.textContent.trim();
      const match = trimmedText.match(reNumber);
      const number = match ? match[1] : null;

      mappingTable[nodeid] = {
        id,
        href,
        title: trimmedText.replace(reNumber, '').trim().replace(/\s+/g, ' ')
      };

      if (number) {
        // Store the number without the final "."
        mappingTable[nodeid].number = number.replace(/\.$/, '');
      }
    }
  });

  return mappingTable;
}