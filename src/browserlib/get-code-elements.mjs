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
export default function getCodeElements(codeSelectors, { excludeSelectors = [] }) {
    return [...document.querySelectorAll(codeSelectors.join(', '))]
        // Skip excluded and elements and those in informative content
        .filter(el => !el.closest(excludeSelectors.join(', ')))
        .filter(el => !el.closest(informativeSelector))

        // Clone and clean the elements
        .map(cloneAndClean);
}