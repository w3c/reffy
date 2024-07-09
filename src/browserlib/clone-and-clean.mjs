import informativeSelector from './informative-selector.mjs';

/**
 * Return a copy of the given HTML element, stripped of annotations, side
 * panels, and of HTML comments.
 */
export default function (element) {
  // Apply modifications to a copy of the element
  const copy = element.cloneNode(true);

  // Drop asides that authoring tools add here and there
  let el;
  while (el = copy.querySelector(informativeSelector)) {
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