import getGenerator from './get-generator.mjs';
import getCodeElements from './get-code-elements.mjs';
import trimSpaces from './trim-spaces.mjs';

/**
 * Extract the list of WebIDL definitions in the current spec
 *
 * @function
 * @public 
 * @return {String} A dump of the IDL definitions, or an empty string if the
 * spec does not contain any IDL.
 */
export default function () {
    const generator = getGenerator();
    let idl = '';
    if (generator === 'bikeshed') {
        idl = extractBikeshedIdl();
    }
    else if (document.title.startsWith('Web IDL')) {
        // IDL content in the Web IDL spec are... examples,
        // not real definitions
    }
    else {
        // Most non-ReSpec specs still follow the ReSpec conventions
        // for IDL definitions
        idl = extractRespecIdl();
    }

    if (idl) {
        // Remove trailing spaces and use spaces throughout
        idl = idl
            .replace(/\s+$/gm, '\n')
            .replace(/\t/g, '  ')
            .trim();
    }
    return idl;
}


/**
 * Extract IDL definitions from a Bikeshed spec
 *
 * Note Bikeshed summarizes IDL definitions in an appendix. This is
 * what the code uses.
 */
function extractBikeshedIdl() {
    const idlHeading = document.getElementById('idl-index');
    if (idlHeading) {
        const nextEl = idlHeading.nextElementSibling;
        if (nextEl) {
            return nextEl.textContent;
        }
        else {
            throw new Error('Could not find IDL in IDL index');
        }
    }
    else {
        // the document may have been generated with "omit idl-index"
        // in which case, we try the simple way
        return extractRespecIdl();
    }
}


/**
 * Extract IDL definitions from a ReSpec spec, and in practice from
 * most other specs as well.
 *
 * The function tries all known patterns used to define IDL content, making
 * sure that it only extracts elements once.
 */
function extractRespecIdl() {
    const idlSelectors = [
        'pre.idl:not(.exclude):not(.extract):not(#actual-idl-index)',
        'pre:not(.exclude):not(.extract) > code.idl-code:not(.exclude):not(.extract)',
        'pre:not(.exclude):not(.extract) > code.idl:not(.exclude):not(.extract)',
        'div.idl-code:not(.exclude):not(.extract) > pre:not(.exclude):not(.extract)',
        'pre.widl:not(.exclude):not(.extract)'
    ];

    const excludeSelectors = [
        '#idl-index',
        '.chapter-idl'
    ];

    const idlElements = getCodeElements(idlSelectors, { excludeSelectors });
    return idlElements
        .map(el => trimSpaces(el.textContent))
        .join('\n\n');
}