/**
 * Gets the title of the document
 */
export default function () {
  const title = window.document.querySelector('title');
  if (window.location.href === 'https://html.spec.whatwg.org/multipage/workers.html') {
    // Web Worker ED is a page of the HTML Living Standard.
    // Report the appropriate title (crawler will still be confused because
    // it won't find any normative references at the end of this page)
    return 'Web Workers';
  }
  else if (title) {
    return title.textContent.trim();
  }
  else {
    return '[No title found for ' + window.location.href + ']';
  }
}