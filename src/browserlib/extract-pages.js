/**
 * Extract pages from the table of contents of the current document.
 *
 * The function returns the list of URLs of all sub-pages of the current
 * document, in the order of their appearance in the table of contents.
 * 
 * URLs in the list do not have fragment parts (e.g. no "#section"), and a
 * given URL only appears once.
 *
 * The URL of the current document is not included in the list.
 *
 * @function
 * @public
 * @return {Array(String)} An array of URLs
*/
export default function () {
  const allPages = [...document.querySelectorAll('.toc a[href]')]
    .map(link => link.href)
    .map(url => url.split('#')[0])
    .filter(url => url !== window.location.href);
  const pageSet = new Set(allPages);
  return [...pageSet];
}
