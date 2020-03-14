/**
 * Gets the title of the document
 */
export default function () {
  const title = window.document.querySelector('title');
  if (title) {
    return title.textContent.trim();
  }
  else {
    return '[No title found for ' + window.location.href + ']';
  }
}