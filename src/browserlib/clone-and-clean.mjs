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

  // Replace "buttons" (typically used for dfn panels) by their inner contents
  while (el = copy.querySelector('button')) {
    el.replaceWith(...el.childNodes);
  }

  // Remove HTML comments
  const commentsIterator = document.createNodeIterator(copy, NodeFilter.SHOW_COMMENT);
  let comment;
  while ((comment = commentsIterator.nextNode())) {
    comment.remove();
  }

  // Multi-page specs are merged into a single DOM to ease processing, each
  // page being identified by a `data-reffy-page` attribute to be able to
  // reconstruct absolute URLs. If the initial element belongs to a page,
  // let's copy the attribute.
  const pageEl = element.closest('[data-reffy-page]');
  if (pageEl) {
    copy.setAttribute('data-reffy-page', pageEl.getAttribute('data-reffy-page'));
  }

  return copy;
}