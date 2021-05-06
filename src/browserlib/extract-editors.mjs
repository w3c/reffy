export default function () {
  const dtEls = document.querySelectorAll('.head dl dt');
  if (!dtEls) return;
  const editorsDtEl = [...dtEls].find(dt => dt.textContent.match(/^Editor/) && !dt.textContent.match(/draft/i));
  if (!editorsDtEl) return;
  let editors = [];
  let dd = editorsDtEl.nextSibling;
  while (dd) {
    if (dd.tagName) {
      if (dd.tagName !== "DD") break;
      editors.push({text: dd.textContent.trim(), markup: dd.innerHTML});
    }
    dd = dd.nextSibling;
  }
  return editors;
}
