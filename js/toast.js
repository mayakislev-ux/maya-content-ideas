export function showToast(message, { actionLabel, onAction, duration = 5000 } = {}) {
  const toast = document.createElement('div');
  toast.className = 'toast';

  const text = document.createElement('span');
  text.textContent = message;
  toast.appendChild(text);

  let timer = null;
  const remove = () => {
    clearTimeout(timer);
    toast.remove();
  };

  if (actionLabel && onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action-btn';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => {
      onAction();
      remove();
    });
    toast.appendChild(btn);
  }

  document.body.appendChild(toast);
  timer = setTimeout(remove, duration);
  return remove;
}
