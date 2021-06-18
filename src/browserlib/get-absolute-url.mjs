/**
 * Gets the absolute URL with fragment to the given node
 *
 * @function
 * @public
 * @param {Element} node DOM node to look at. Must have an ID.
 * @param {Object} options singlePage asserts whether the spec is single page
 *   or whether that's unknown. Default is false for "unknown".
 * @return {String} Absolute URL ending with fragment ref
 */
export default function (node, { singlePage } = { singlePage: false }) {
  const page = singlePage ? null :
    node.closest('[data-reffy-page]')?.getAttribute('data-reffy-page');
  const url = new URL(page ?? window.location.href);
  url.hash = '#' + node.id;
  return url.toString();
}
