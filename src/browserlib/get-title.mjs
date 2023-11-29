/**
 * Gets the title of the document
 */
export default function (spec) {
  const title = window.document.querySelector('title');
  if (title) {
    return title.textContent.replace(/\s+/g, ' ').trim();
  }
  else if (spec?.title) {
    return spec.title;
  }
  else {
    return '[No title found for ' + window.location.href + ']';
  }
}