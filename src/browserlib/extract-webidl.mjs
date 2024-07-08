import getGenerator from './get-generator.mjs';
import informativeSelector from './informative-selector.mjs';
import cloneAndClean from './clone-and-clean.mjs';

/**
 * Extract the list of WebIDL definitions in the current spec
 *
 * @function
 * @public 
 * @return {Promise} The promise to get a dump of the IDL definitions, or
 *   an empty string if the spec does not contain any IDL.
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
    // Helper function that trims individual lines in an IDL block,
    // removing as much space as possible from the beginning of the page
    // while preserving indentation. Rules followed:
    // - Always trim the first line
    // - Remove whitespaces from the end of each line
    // - Replace lines that contain spaces with empty lines
    // - Drop same number of leading whitespaces from all other lines
    const trimIdlSpaces = idl => {
        const lines = idl.trim().split('\n');
        const toRemove = lines
            .slice(1)
            .filter(line => line.search(/\S/) > -1)
            .reduce(
                (min, line) => Math.min(min, line.search(/\S/)),
                Number.MAX_VALUE);
        return lines
            .map(line => {
                let firstRealChat = line.search(/\S/);
                if (firstRealChat === -1) {
                    return '';
                }
                else if (firstRealChat === 0) {
                    return line.replace(/\s+$/, '');
                }
                else {
                    return line.substring(toRemove).replace(/\s+$/, '');
                }
            })
            .join('\n');
    };

    // Detect the IDL index appendix if there's one (to exclude it)
    const idlEl = document.querySelector('#idl-index pre') ||
        document.querySelector('.chapter-idl pre'); // SVG 2 draft

    let idl = [
        'pre.idl:not(.exclude):not(.extract):not(#actual-idl-index)',
        'pre:not(.exclude):not(.extract) > code.idl-code:not(.exclude):not(.extract)',
        'pre:not(.exclude):not(.extract) > code.idl:not(.exclude):not(.extract)',
        'div.idl-code:not(.exclude):not(.extract) > pre:not(.exclude):not(.extract)',
        'pre.widl:not(.exclude):not(.extract)'
    ]
        .map(sel => [...document.querySelectorAll(sel)])
        .reduce((res, elements) => res.concat(elements), [])
        .filter(el => el !== idlEl)
        .filter((el, idx, self) => self.indexOf(el) === idx)
        .filter(el => !el.closest(informativeSelector))
        .map(cloneAndClean)
        .map(el => trimIdlSpaces(el.textContent))
        .join('\n\n');

    return idl;
}