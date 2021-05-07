export default function () {
  const dtEls = document.querySelectorAll('.head dl dt');
  if (!dtEls) return;
  const editorsDtEl = [...dtEls].find(dt => dt.textContent.match(/^Editor/) && !dt.textContent.match(/draft/i));
  if (!editorsDtEl) return;
  let editors = [];
  let dd = editorsDtEl.nextElementSibling;
  while (dd) {
    if (dd.tagName) {
      if (dd.tagName !== "DD") break;
      let editor = { text: dd.textContent.trim(), markup: dd.innerHTML };
      if (dd.dataset.editorId) {
        editor.editorId = dd.dataset.editorId;
      }
      if (dd.classList.contains('h-card')) {
        // Editor data is structured with https://microformats.org/wiki/h-card.
        // We'll parse the subset of that general format that appears in specs.
        for (let child = dd.firstElementChild; child; child = child.nextElementSibling) {
          if (child.classList.contains('p-org')) {
            editor.org = { name: child.textContent.trim() }
            if (child.classList.contains('u-email')) {
              editor.org.email = new URL(child.href).pathname;
            } else if (child.href) {
              editor.org.url = child.href;
            }
          }
          else if (child.classList.contains('p-name')) {
            editor.name = child.textContent.trim();
            if (child.href) {
              if (child.classList.contains('u-email')) {
                editor.email = new URL(child.href).pathname;
              } else {
                editor.url = child.href;
              }
            }
          }
        }
      } else {
        // Try to parse a name and organization out of plain text.
        let parsed = /(?<name>[^(]+)\((?<org>[^)]+)\)/.exec(editor.text);
        if (parsed) {
          editor.name = parsed.groups.name;
          editor.org = { name: parsed.groups.org };
        }
      }
      editors.push(editor);
    }
    dd = dd.nextElementSibling;
  }
  return editors;
}
