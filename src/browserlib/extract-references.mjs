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
  if (references?.normative.length || references?.informative.length) {
    return references;
  }
  else {
    return null;
  }
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
 * @param {String} name The sibling name to find, "heading" to match any heading
 * @param {Node} until The optional DOM sibling at which to stop no matter what
 * @return {Node} The next sibling with the given name, null if not found
 */
function nextTag(node, name, until) {
  let nextEl = node.nextElementSibling;
  const selector = name === "heading" ? "h1,h2,h3,h4,h5,h6,hgroup" : name;
  while (nextEl && nextEl !== until && !nextEl.matches(selector)) {
    nextEl = nextEl.nextElementSibling;
  }
  if (nextEl === until) {
    nextEl = null;
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
  if (referenceList.tagName === "DL") {
    [...referenceList.children]
      .filter(child => child.tagName === "DT")
      .forEach(function (dt) {
        var ref = {};
        ref.name = dt.textContent.replace(/[\[\] \n]/g, '');
        var desc = nextTag(dt, "dd");
        if (!desc || !ref.name) {
          return;
        }
        const url = desc.querySelector('a[href*="://"]')?.href;
        if (url) {
          ref.url = url;
        }
        if (options.filterInformative &&
            desc.textContent.match(/non-normative/i)) {
          return informativeRef.push(ref);
        }
        defaultRef.push(ref);
      });
  }
  else if (referenceList.tagName === "UL") {
    [...referenceList.children]
      .filter(child => child.tagName === "LI")
      .forEach(function (li) {
        // The ECMA-402 spec lists nests another list for more atomic
        // references with "URLs in your face":
        // https://tc39.es/ecma402/#normative-references
        // Let's drop nested lists for now to avoid extracting noise
        // (TODO: consider smarter code or creating an exception to the rule
        // for ECMA-402)
        li = li.cloneNode(true);
        [...li.querySelectorAll("ul")].map(el => el.remove());
        var anchor = li.querySelector("a[href]");
        var ref = {};
        if (anchor) {
          ref.name = anchor.innerText.trim();
          ref.url = anchor.getAttribute("href");
        }
        else {
          ref.name = li.innerText.trim();
        }
        defaultRef.push(ref);
      });
  }
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
  console.log('[reffy]', 'extract refs without rules');

  // Custom logic for Source map format specification (ECMA-426)
  // Looks for <emu-clause id="sec-references"> and its child clauses
  for (const refType of ['normative', 'informative']) {
    const clause = document.querySelector([
      `emu-clause#sec-references-${refType}`,
      `emu-clause#sec-${refType}-references`
    ].join(','));
    if (clause) {
      const refs = [];
      clause.querySelectorAll('p').forEach(p => {
        const ref = {};
        const match = p.innerText.match(/(.+?), /m);
        if (match) {
          ref.name = match[1].trim();
        }
        if (!match) {
          ref.name = p.querySelector('i')?.innerText.trim();
        }
        if (!ref.name) {
          return;
        }

        const anchor = p.querySelector('a[href]');
        if (anchor) {
          ref.url = anchor.getAttribute('href');
        }
        refs.push(ref);
      });
      references[refType] = refs;
    }
  }

  // Look for a "Normative references" heading
  const normative = anchors.findLast(
    textMatch(/^\s*((\w|\d+)(\.\d+)*\.?)?\s*normative\s+references\s*$/i));
  if (normative) {
    console.log('[reffy]', 'normative references section found', normative.textContent);
    const nextHeading = nextTag(normative, "heading");
    let nList = nextTag(normative, "dl", nextHeading);
    if (!nList) {
      nList = nextTag(normative, "ul", nextHeading);
    }
    if (nList) {
      references.normative = parseReferences(nList)[0];
    }
  }

  // Look for an "Informative references" heading
  const informative = anchors.findLast(
    textMatch(/^\s*((\w|\d+)(\.\d+)*\.?)?\s*(informative|non-normative)\s+references\s*$/i));
  if (informative) {
    const nextHeading = nextTag(informative, "heading");
    let iList = nextTag(informative, "dl", nextHeading);
    if (!iList) {
      iList = nextTag(informative, "ul", nextHeading);
    }
    if (iList) {
      references.informative = parseReferences(iList)[0];
    }
  }

  if (informative || normative) {
    return references;
  }

  // Look for a generic "references" heading
  const refHeading = anchors.findLast(textMatch(/references/i));
  if (refHeading) {
    const nextSection = nextTag(refHeading, refHeading.tagName);
    const subHeadingLevel = "h" + (parseInt(refHeading.tagName.substring(1), 10) + 1);
    let subHeading = refHeading;
    while (subHeading = nextTag(subHeading, subHeadingLevel, nextSection)) {
      if (subHeading.textContent.match(/normative/i) ||
          subHeading.textContent.match(/informative/i)) {
        let list = nextTag(subHeading, "dl", nextSection);
        if (!list) {
          list = nextTag(subHeading, "ul", nextSection);
        }
        if (list) {
          const type = subHeading.textContent.match(/normative/i) ?
            "normative" : "informative";
          references[type] = parseReferences(list)[0];
        }
      }
    }

    if (references.normative.length === 0 &&
        references.informative.length === 0) {
      // No subheading, flat list of references
      let list = nextTag(refHeading, "dl", nextSection);
      if (!list) {
        list = nextTag(refHeading, "ul", nextSection);
      }
      if (list) {
        const refs = parseReferences(list, { filterInformative: true });
        references.normative = refs[0];
        references.informative = refs[1];
      }
    }
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
