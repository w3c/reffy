/**
 * Extract definitions in the spec that follow the "Definitions data model":
 * https://tabatkins.github.io/bikeshed/#dfn-contract
 *
 * Each definition returned by the function will have the following properties:
 * - id: The local ID in the DOM. Should be unique within a spec page.
 * - name: The text of the definition.
 * - linkingText: List of linking phrases for references.
 * - localLinkingText: List of linking phrases for local references only.
 * - type: The definition type. One of the values in
 *     https://tabatkins.github.io/bikeshed/#dfn-types
 * - for: The list of namespaces for the definition
 * - exported: true when definition can be referenced by other specifications,
 *     false when it should be viewed as a local definition only.
 *
 * @function
 * @public
 * @return {Array(Object)} An Array of definitions
*/
export default function () {
  const definitionsSelector = [
    'dfn[id]',
    'h2[id][data-dfn-type]',
    'h3[id][data-dfn-type]',
    'h4[id][data-dfn-type]',
    'h5[id][data-dfn-type]',
    'h6[id][data-dfn-type]'
  ].join(',');

  return [...document.querySelectorAll(definitionsSelector)]
    .map(el => Object.assign({
      // ID is the id attribute
      id: el.getAttribute('id'),

      // Compute the absolute URL
      // (Note the crawler merges pages of a multi-page spec in the first page
      // to ease parsing logic, and we want to get back to the URL of the page)
      href: (_ => {
        const pageWrapper = el.closest('[data-reffy-page]');
        const url = new URL(pageWrapper ?
          pageWrapper.getAttribute('data-reffy-page') : window.location.href);
        url.hash = '#' + el.getAttribute('id');
        return url.toString();
      })(),

      // Linking text is given by the data-lt attribute if present, or it is the
      // textual content
      linkingText: el.hasAttribute('data-lt') ?
        el.getAttribute('data-lt').split('|').map(s => s.trim()) :
        [el.textContent.trim()],

      // Additional linking text can be defined for local references
      localLinkingText: el.getAttribute('data-local-lt') ?
        el.getAttribute('data-local-lt').split('|').map(s => s.trim()) :
        [],

      // Link type must be specified, or it is "dfn"
      type: el.getAttribute('data-dfn-type') || 'dfn',

      // Definition may be namespaced to other constructs. Note the list is not
      // purely comma-separated due to function parameters. For instance,
      // attribute value may be "method(foo,bar), method()"
      for: el.getAttribute('data-dfn-for') ?
        el.getAttribute('data-dfn-for').split(/,(?![^\(]*\))/).map(s => s.trim()) :
        [],

      // Definition is exported if explictly marked as such or if export has not
      // been explicitly disallowed and its type is not "dfn"
      exported: el.hasAttribute('data-export') ||
        (!el.hasAttribute('data-noexport') &&
          el.hasAttribute('data-dfn-type') &&
          el.getAttribute('data-dfn-type') !== 'dfn')
    }));
}