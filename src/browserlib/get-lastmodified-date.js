export default function () {
  const dateEl = document.querySelector('.head time');
  const statusAndDate = [...document.querySelectorAll('.head h2')]
    .map(el => el.textContent).join(' ').trim();
  const lastModified = new Date(Date.parse(document.lastModified));
  const date = dateEl ? dateEl.textContent.trim() :
    (statusAndDate ? statusAndDate.split(/\s+/).slice(-3).join(' ') :
    [
      lastModified.toLocaleDateString('en-US', { day: 'numeric' }),
      lastModified.toLocaleDateString('en-US', { month: 'long' }),
      lastModified.toLocaleDateString('en-US', { year: 'numeric' })
    ].join(' '));
  return date;
}