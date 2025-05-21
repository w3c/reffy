import createOutline from './create-outline.mjs';
import getAbsoluteUrl from './get-absolute-url.mjs';

// Regular expression to capture the numbering of a heading. The expression
// extracts numbers such as "1.", "A.", "A.3", "13.3.4.". Notes:
// - A top-level number always ends with a ".", except in CSS 2.1, some IETF RFCs
// and WebGL specs.
// - There may be no final "." in sublevels (Bikeshed adds one, not ReSpec)
// - Top level appendices (e.g. in CSS 2.1, IETF RFCs and Bikeshed specs) start
// with "Appendix", sometimes followed by ":"
const reNumber = /^([A-Z\d]\.|[A-Z](\.\d+)+\.?|\d+(\.\d+)+\.?|\d|Appendix [A-Z][\.:])\s/;

/**
 * Retrieve a "cleaned" version of the node's text content, without aside notes
 * such as links to tests, MDN or references.
 *
 * Note that this is mainly intended for CSS Color 3, which has test annotations
 * within headings.
 */
function getCleanTextContent(node) {
  const asideSelector = 'aside, .mdn-anno, .wpt-tests-block, .annotation';
  const cleanedNode = node.cloneNode(true);
  const annotations = cleanedNode.querySelectorAll(asideSelector);
  annotations.forEach(n => n.remove());
  return cleanedNode.textContent.trim().replace(/\s+/g, ' ');
}

/**
 * Generate a mapping between elements that have an ID (or a "name") and the
 * closest heading (that also has an ID) under which these elements appear in
 * the DOM tree.
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
  // Special-casing ecmascript specs which use special markup for sections
  // <emu-clause>
  if (document.querySelector("emu-clause")) {
    return esMapIdToHeadings();
  }


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
  [...document.querySelectorAll('[id],[name]')].forEach(node => {
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
    const idAttr = node.id ? 'id' : 'name';
    const nodeid = getAbsoluteUrl(node, { singlePage, attribute: idAttr });
    let href = nodeid;

    if (parentSection) {
      const ids = [];
      let id;

      const heading = parentSection.heading;
      if (heading.id) {
        id = heading.id;
        href = getAbsoluteUrl(heading, { singlePage });
	ids.push(id);
      }
      else {
        const anchor = heading.querySelector('a[name]');
        if (anchor) {
          id = anchor.getAttribute('name');
          href = getAbsoluteUrl(anchor, { singlePage, attribute: 'name' });
	  ids.push(id);
        }
      }

      if (parentSection.root && parentSection.root.id) {
        id = parentSection.root.id;
        href = getAbsoluteUrl(parentSection.root, { singlePage });
      }

      const trimmedText = getCleanTextContent(heading);
      const match = trimmedText.match(reNumber);
      const number = match ? match[1] : null;

      const mapping = {};
      if (id) {
	ids.push(id);

      }
      if (ids.length) {
	mapping.id = ids.pop();
      }
      mapping.href = href;
      mapping.title = trimmedText.replace(reNumber, '');
      if (ids.length) {
	mapping.alternateIds = ids;
      }
      mappingTable[nodeid] = mapping;

      if (number) {
        // Store the number without the final "." or ":"
        // (and without the "Appendix" prefix in the CSS 2.1 case)
        mappingTable[nodeid].number = number.replace(/[\.:]$/, '').replace(/^Appendix /, '');
      }
    }
  });

  return mappingTable;
}

function esMapIdToHeadings() {
  // Based on https://tc39.es/ecmarkup/
  // and actual emu-* tags used in the ecmascript spec with ids
  const ignoreTags = ["emu-xref"];
  const sectionTags = ["emu-intro", "emu-clause", "emu-annex"];

  // Compute once whether we created a single page version out of multiple pages
  const singlePage = !document.querySelector('[data-reffy-page]');

  let mappingTable = {};
  [...document.querySelectorAll(`[id]:not(${ignoreTags.join(',')}`)]
    .forEach(el => {
      const section = el.closest(`${sectionTags.map(t => `${t}[id]`).join(',')}`);

      // These are spec UI-related ids, so not a loss
      if (!section) return;

      const heading = section.querySelector("h1");
      const trimmedText = getCleanTextContent(heading);
      const nodeid = getAbsoluteUrl(el, { singlePage });
      const href = getAbsoluteUrl(section, { singlePage });

      const match = trimmedText.match(reNumber);
      const number = match ? match[1] : null;

      const mapping = {};
      if (section.id) {
        mapping.id = section.id;
      }
      mapping.href = href;
      mapping.title = trimmedText.replace(reNumber, '');
      mappingTable[nodeid] = mapping;

      if (number) {
        // Store the number without the final "."
        mappingTable[nodeid].number = number.replace(/\.$/, '');
      }

    });
  return mappingTable;
}
