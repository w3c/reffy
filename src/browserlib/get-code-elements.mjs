import informativeSelector from './informative-selector.mjs';
import cloneAndClean from './clone-and-clean.mjs';

/**
 * Helper function that returns a set of code elements in document order based
 * on a given set of selectors, excluding elements that are within an index.
 *
 * The function excludes elements defined in informative sections, elements
 * that have an ancestor matching one of the exclude selectors, and elements
 * for which the exclude filter, called on the live element, returns true.
 *
 * The code elements are cloned and cleaned before they are returned to strip
 * annotations and other asides.
 */
export default function getCodeElements(codeSelectors, { excludeSelectors = [], excludeFilter = () => false }) {
    return [...document.querySelectorAll(codeSelectors.join(', '))]
        // Skip excluded and elements and those in informative content
        .filter(el => excludeSelectors.length === 0 || !el.closest(excludeSelectors.join(', ')))
        .filter(el => !excludeFilter(el))
        .filter(el => !el.closest(informativeSelector))

        // Clone and clean the elements
        .map(cloneAndClean);
}