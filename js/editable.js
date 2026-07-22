// Shared by content-plan.js (used by everyone) and warming.js (admin-only) -
// pulled out of warming.js specifically so content-plan.js doesn't force a
// transitive import of the whole (much larger) admin-only warming module for
// every regular user just to get this one small helper.
export function makeEditable(el, onCommit) {
  el.contentEditable = 'true';
  el.classList.add('warming-editable');
  el.addEventListener('blur', () => onCommit(el.textContent.trim()));
}
