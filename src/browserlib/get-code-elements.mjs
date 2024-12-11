import informativeSelector from './informative-selector.mjs';
import cloneAndClean from './clone-and-clean.mjs';

/**
 * Helper function that returns a set of code elements in document order based
 * on a given set of selectors, excluding elements that are within an index.
 *
 * The function excludes elements defined in informative sections.
 *
 * The code elements are cloned and cleaned before they are returned to strip
 * annotations and other asides.
 */
export default function getCodeElements(codeSelectors, excludeSelectors) {
    return [...document.querySelectorAll(codeSelectors.join(', '))]
        // Only keep the elements that are not within the index at the end of
        // the specification and that are defined in a normative section.
        .filter(el => !el.closest((excludeSelectors ?? []).join(', ')))
        .filter(el => !el.closest(informativeSelector))

        // Clone and clean the elements
        .map(cloneAndClean);
}