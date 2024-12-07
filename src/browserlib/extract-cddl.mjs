import getCodeElements from './get-code-elements.mjs';
import trimSpaces from './trim-spaces.mjs';

/**
 * Extract the list of CDDL definitions in the current spec.
 *
 * A spec may define more that one CDDL module. For example, the WebDriver BiDi
 * spec has CDDL definitions that apply to either of both the local end and the
 * remote end. The functions returns an array that lists all CDDL modules.
 * 
 * Each CDDL module is represented as an object with the following keys whose
 * values are strings:
 * - shortname: the CDDL module shortname. Shortname is "" if there are no
 * - label: A full name for the CDDL module.
 * - cddl: A dump of the CDDL definitions.
 *
 * If the spec defines more than one module, the first item in the array is the
 * "all" module that contains a dump of all CDDL definitions, regardless of the
 * module they are actually defined for (the assumption is that looking at the
 * union of all CDDL modules defined in a spec will always make sense, and that
 * a spec will never reuse the same rule name with a different definition for
 * different CDDL modules).
 *
 * @function
 * @public 
 * @return {Promise} The promise to get a dump of the CDDL definitions per
 *   CDDL module, or an empty array if the spec does not contain any CDDL.
 */
export default function () {
    // Specs with CDDL are either recent enough that they all use the same
    // `<pre class="cddl">` convention, or they don't flag CDDL blocks in any
    // way, making it impossible to extract them.
    const cddlSelector = 'pre.cddl:not(.exclude):not(.extract)';
    const indexSelector = '#cddl-index';

    // Retrieve all elements that contains CDDL content
    const cddlEls = getCodeElements([cddlSelector], [indexSelector]);

    // By convention, CDDL defined without specifying a module is defined
    // for all modules (that CDDL would essentially be lost otherwise, there's
    // no reason for a spec to define CDDL for no module if it uses modules).
    // Start by assembled the list of modules
    const modules = {};
    for (const el of cddlEls) {
        const elModules = getModules(el);
        for (const name of elModules) {
            modules[name] = [];
        }
    }

    // Assemble the CDDL per module
    const mergedCddl = [];
    for (const el of cddlEls) {
        const cddl = trimSpaces(el.textContent);
        if (!cddl) {
            continue;
        }
        mergedCddl.push(cddl);
        let elModules = getModules(el);
        if (elModules.length === 0) {
            // No module means the CDDL is defined for all modules
            elModules = Object.keys(modules);
        }
        for (const name of elModules) {
            if (!modules[name]) {
                modules[name] = [];
            }
            modules[name].push(cddl);
        }
    }

    if (mergedCddl.length === 0) {
        return [];
    }
    const res = [ { name: "", cddl: mergedCddl.join('\n\n') } ];
    for (const [name, cddl] of Object.entries(modules)) {
        res.push({ name, cddl: cddl.join('\n\n') });
    }
    // Remove trailing spaces and use spaces throughout
    for (const cddlModule of res) {
        cddlModule.cddl = cddlModule.cddl
            .replace(/\s+$/gm, '\n')
            .replace(/\t/g, '  ')
            .trim();
    }
    return res;
}


/**
 * Retrieve the list of CDDL module shortnames that the element references.
 *
 * This list of modules is either specified in a `data-cddl-module` attribute
 * or directly within the class attribute prefixed by `cddl-` or suffixed by
 * `-cddl`.
 */
function getModules(el) {
    const moduleAttr = el.getAttribute('data-cddl-module');
    if (moduleAttr) {
        return moduleAttr.split(',').map(str => str.trim());
    }

    const list = [];
    const classes = el.classList.values()
    for (const name of classes) {
        const match = name.match(/^(.*)-cddl$|^cddl-(.*)$/);
        if (match) {
            const shortname = match[1] ?? match[2];
            if (!list.includes(shortname)) {
                list.push(shortname);
            }
        }
    }
    return list;
}
