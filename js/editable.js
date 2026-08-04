// Shared by content-plan.js (used by everyone) and warming.js (admin-only) -
// pulled out of warming.js specifically so content-plan.js doesn't force a
// transitive import of the whole (much larger) admin-only warming module for
// every regular user just to get this one small helper.
export function makeEditable(el, onCommit) {
  el.contentEditable = 'true';
  el.classList.add('warming-editable');
  el.addEventListener('blur', () => onCommit(el.textContent.trim()));
}

// Click an element (a <td> or any other container) to turn it into a
// <select> with a blank "-" option; commits on change, reverts to a
// read-only render on blur. Originally lived only in content-plan.js's
// table cells - moved here so warming.js can reuse the identical pattern
// on a non-table element instead of re-implementing it.
export function makeEditableSelect(el, options, currentValue, onCommit, renderValue) {
  el.classList.add('table-editable-cell');
  el.title = 'לחיצה לעריכה';

  const show = (value) => {
    el.innerHTML = '';
    el.appendChild(renderValue(value));
  };
  show(currentValue);

  el.addEventListener('click', () => {
    if (el.querySelector('select')) return;
    const select = document.createElement('select');
    select.className = 'table-cell-select';
    const blankOption = document.createElement('option');
    blankOption.value = '';
    blankOption.textContent = '-';
    select.appendChild(blankOption);
    for (const opt of options) {
      const optionEl = document.createElement('option');
      optionEl.value = opt;
      optionEl.textContent = opt;
      select.appendChild(optionEl);
    }
    select.value = options.includes(currentValue) ? currentValue : '';
    el.innerHTML = '';
    el.appendChild(select);
    select.focus();
    select.addEventListener('change', () => {
      currentValue = select.value;
      onCommit(currentValue);
      show(currentValue);
    });
    select.addEventListener('blur', () => show(currentValue));
  });
}
