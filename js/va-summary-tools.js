/* 05/11/2026 (מאיה): שני כלים בסוף הסיכום של העוזר, אחרי התסריט:
   "🎬 דף צילום" (va-filming.js) ו"✍️ תיאור לסרטון" (va-description.js).
   כאן רק הכפתורים והחיבור שלהם, כדי ש-video-assistant.js ייגע בזה בשתי
   שורות בלבד. */
import { mountFilming } from './va-filming.js';
import { openDescriptionTool } from './va-description.js';

export function summaryToolsHtml() {
  return `<div class="va-summary-tools">
    <button type="button" class="cosmic-btn va-tool-btn" id="va-filming-btn">🎬 דף צילום</button>
    <button type="button" class="cosmic-btn va-tool-btn" id="va-desc-btn">✍️ תיאור לסרטון</button>
  </div>`;
}

/**
 * deps: {
 *   getState()            הסטייט של העוזר עכשיו
 *   patch(changes)        כתיבה לסטייט ושמירה (הסשן והפריט ב"התסריטים שלי")
 *   script                הטקסט הסופי
 *   getContext()          Promise<{ domain, audience }>
 *   openModal, copyBtn, wireCopyButtons, showToast, serverErrorText
 * }
 */
export function wireSummaryTools(root, deps) {
  const filmingBtn = root.querySelector('#va-filming-btn');
  if (filmingBtn) filmingBtn.addEventListener('click', () => {
    const overlay = deps.openModal('<div class="va-filming" id="va-filming"></div>', { backdropClose: false });
    overlay.querySelector('.cosmic-modal').classList.add('va-filming-modal');
    mountFilming(overlay.querySelector('#va-filming'), {
      state: deps.getState(),
      onChange: (checks) => deps.patch({ filmingChecks: checks }),
    });
  });
  const descBtn = root.querySelector('#va-desc-btn');
  if (descBtn) descBtn.addEventListener('click', () => {
    openDescriptionTool({
      state: deps.getState(),
      script: deps.script,
      getContext: deps.getContext,
      onSave: (result) => deps.patch({ videoDescription: result }),
      openModal: deps.openModal,
      copyBtn: deps.copyBtn,
      wireCopyButtons: deps.wireCopyButtons,
      showToast: deps.showToast,
      serverErrorText: deps.serverErrorText,
    });
  });
}
