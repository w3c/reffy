/**
 * Return a copy of the given HTML element, stripped of annotations, side
 * panels, and of HTML comments.
 */
export default function (element) {
  // Apply modifications to a copy of the element
  const copy = element.cloneNode(true);

  // Drop asides that authoring tools add here and there
  let el;
  const asideSelector = [
    'aside', '.note', '.annotation', '.idlHeader', '[id^=dfn-panel-]',
    '.mdn-anno', '.wpt-tests-block', 'details.respec-tests-details',
    '.example', '.informative', '.informative-bg'
  ].join(',');
  while (el = copy.querySelector(asideSelector)) {
    el.remove();
  }

  // Remove HTML comments
  const commentsIterator = document.createNodeIterator(copy, NodeFilter.SHOW_COMMENT);
  let comment;
  while ((comment = commentsIterator.nextNode())) {
    comment.remove();
  }

  return copy;
}