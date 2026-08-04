let activeResolve = null;

export function wireConfirmDialog() {
  const dialog = document.getElementById('confirm-dialog');
  const okBtn = document.getElementById('confirm-dialog-ok');
  const cancelBtn = document.getElementById('confirm-dialog-cancel');

  const resolveAndClose = (result) => {
    dialog.hidden = true;
    if (activeResolve) {
      const r = activeResolve;
      activeResolve = null;
      r(result);
    }
  };

  okBtn.addEventListener('click', () => resolveAndClose(true));
  cancelBtn.addEventListener('click', () => resolveAndClose(false));
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) resolveAndClose(false);
  });
}

export function confirmDialog(message, { okLabel = 'אישור', cancelLabel = 'ביטול' } = {}) {
  const dialog = document.getElementById('confirm-dialog');
  document.getElementById('confirm-dialog-message').textContent = message;
  document.getElementById('confirm-dialog-ok').textContent = okLabel;
  const cancelBtn = document.getElementById('confirm-dialog-cancel');
  cancelBtn.hidden = false;
  cancelBtn.textContent = cancelLabel;
  dialog.hidden = false;
  return new Promise((resolve) => {
    activeResolve = resolve;
  });
}

export function alertDialog(message, { okLabel = 'הבנתי' } = {}) {
  const dialog = document.getElementById('confirm-dialog');
  document.getElementById('confirm-dialog-message').textContent = message;
  document.getElementById('confirm-dialog-ok').textContent = okLabel;
  document.getElementById('confirm-dialog-cancel').hidden = true;
  dialog.hidden = false;
  return new Promise((resolve) => {
    activeResolve = () => resolve(true);
  });
}
