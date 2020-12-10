import getGenerator from './get-generator.mjs';


/**
 * Extract the list of references from the "References" appendix of the
 * current document.
 *
 * Notes:
 * - By definition, this function does not return the specifications that
 * the current document references in the prose but failed to add to the
 * "References" appendix.
 * - The function throws when no references could be found
 *
 * @function
 * @public
 * @return {Object} An object with a "normative" and/or an "informative"
 *   property that list references as they appear in the "References".
 */
export default function () {
  const generator = getGenerator();
  const extractionRules = getExtractionRules(generator);
  const references = extractReferences(extractionRules);
  return references;
}



/**
 * Given the name of the generator used to create the document,
 * return the rules to use to extract references.
 *
 * @function
 * @private
 * @param {String} generator The well-known generator used to create the doc,
 *   null if unknown
 * @return {Object} Relevant extraction rules (or null if no rules seem to apply).
 */
function getExtractionRules(generator) {
  const extractionRules = {
    bikeshed: {
      generator: "Bikeshed",
      listSelector: {
        normative: "#normative + dl",
        informative: "#informative + dl"
      }
    },
    respec: {
      generator: "ReSpec",
      listSelector: {
        normative: "#normative-references > dl",
        informative: "#informative-references > dl"
      }
    }
  };

  return (generator ? extractionRules[generator] : null);
}


/**
 * Skip next siblings until another tag with the given name is found
 *
 * @function
 * @private
 * @param {Node} node The DOM node to use as starting point
 * @param {String} name The sibling name to find
 * @return {Node} The next sibling with the given name, null if not found
 */
function nextTag(node, name) {
  let nextEl = node.nextElementSibling;
  while(nextEl && nextEl.tagName !== name.toUpperCase()) {
    nextEl = nextEl.nextElementSibling;
  }
  return nextEl;
}


/**
 * Given a markup definition list, parse and return the list of references
 *
 * @function
 * @param {Node} referenceList The "dl" to parse
 * @param {Object} options Parsing options, set "filterInformative" to put
 *   references flagged as "non-normative" to a separate returned list
 * @return {Array} An array whose first item is the list of references and the
 *   second item the list of "non-normative" references (the second item is only
 *   set when "filterInformative" is set)
 */
function parseReferences(referenceList, options) {
  var defaultRef = [], informativeRef = [];
  options = options || {};
  [].forEach.call(referenceList.querySelectorAll("dt"), function (dt) {
    var ref = {};
    ref.name = dt.textContent.replace(/[\[\] \n]/g, '');
    var desc = nextTag(dt, "dd");
    if (!desc || !ref.name) {
      return;
    }
    ref.url = desc.querySelector("a[href]") ? desc.querySelector("a[href]").href : "";
    if (options.filterInformative &&
        desc.textContent.match(/non-normative/i)) {
      return informativeRef.push(ref);
    }
    defaultRef.push(ref);
  });
  return [defaultRef, informativeRef];
};

const textMatch = re => n => n.textContent.match(re);

/**
 * Extract references from generic documents that we could not associate with
 * any particular set of extraction rules.
 *
 * @function
 * @private
 * @return {Object} A list of references.
 */
function extractReferencesWithoutRules() {
  const references = {
    normative: [],
    informative: []
  };
  const anchors = [...document.querySelectorAll("h1, h2, h3")];
  const referenceHeadings = anchors.filter(textMatch(/references/i));
  if (!referenceHeadings.length) {
    return references;
  }
  if (referenceHeadings.length > 1) {
    const normative = referenceHeadings.find(textMatch(/normative/i));
    if (normative) {
      const nList = nextTag(normative, "dl");
      if (nList) {
        references.normative = parseReferences(nList)[0];
      }
    }
    const informative = referenceHeadings.find(textMatch(/informative/i));
    if (informative) {
      const iList = nextTag(informative, "dl");
      if (iList) {
        references.informative = parseReferences(iList)[0];
      }
    }
    if (informative || normative) {
      return references;
    }
  }

  // If there are still multiple reference headings,
  // keep only the last one
  const referenceHeading = referenceHeadings.pop();
  const list = nextTag(referenceHeading, "dl");
  if (list) {
    const refs = parseReferences(list, { filterInformative: true });
    references.normative = refs[0];
    references.informative = refs[1];
  }
  return references;
}


/**
 * Extract references from the given document
 *
 * @function
 * @private
 * @param {Object} rules Extraction rules to use
 * @return {Object} A list of references.
 */
function extractReferences(rules) {
  if (!rules) {
    return extractReferencesWithoutRules();
  }
  if (!rules.listSelector ||
      !rules.listSelector.normative) {
    throw new Error("Extraction rules for the list of references are incorrect");
  }
  const generator = rules.generator || "an unknown generator";

  const references = {
    normative: [],
    informative: []
  };
  ["normative", "informative"].forEach(function (referenceType) {
    const referenceList = document.querySelector(rules.listSelector[referenceType]);
    if (referenceList) {
      const refs = parseReferences(referenceList, {
        filterInformative: (referenceType === "normative")
      });
      references[referenceType] = references[referenceType].concat(refs[0]);
      if (referenceType === "normative") {
          references.informative = references.informative.concat(refs[1]);
      }
    }
  });

  return references;
}