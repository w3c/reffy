/**
 * Gets the absolute URL with fragment to the given node
 *
 * @function
 * @public
 * @param {Element} node DOM node to look at. Must have an ID.
 * @param {Object} options "singlePage" asserts whether the spec is single page
 *   or whether that's unknown. Default is false for "unknown".
 *   "attribute" tells function to use value of given attribute name instead of
 *   the node's ID. Default is "id".
 * @return {String} Absolute URL ending with fragment ref
 */
export default function (node, { singlePage, attribute } =
                               { singlePage: false, attribute: 'id' }) {
  attribute = attribute ?? 'id';
  const page = singlePage ? null :
    node.closest('[data-reffy-page]')?.getAttribute('data-reffy-page');
  const url = new URL(page ?? window.location.href);
  const hashid = node.getAttribute(attribute);
  if (hashid) {
    url.hash = '#' + encodeURIComponent(hashid);
  }
  return url.toString();
}
