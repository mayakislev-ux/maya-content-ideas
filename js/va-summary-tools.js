/* 05/11/2026 (מאיה): שני כלים בסוף הסיכום של העוזר, אחרי התסריט:
   "✍️ תיאור לסרטון" (va-description.js). דף הצילום נמחק ב-11/11 לבקשת מאיה.
   כאן רק הכפתורים והחיבור שלהם, כדי ש-video-assistant.js ייגע בזה בשתי
   שורות בלבד. */
import { openDescriptionTool } from './va-description.js';

export function summaryToolsHtml() {
  return `<div class="va-summary-tools">
    <button type="button" class="cosmic-btn va-tool-btn" id="va-desc-btn">✍️ תיאור לסרטון</button>
  </div>`;
}

/**
 * deps: {
 *   getState()            הסטייט של העוזר עכשיו
 *   patch(changes)        כתיבה לסטייט ושמירה (הסשן והפריט ב"התסריטים שלי")
 *   script                הטקסט הסופי
 *   getContext()          Promise<{ domain, audience, pronoun }>
 *   openModal, copyBtn, wireCopyButtons, showToast, serverErrorText
 * }
 */
export function wireSummaryTools(root, deps) {
  // 11/11/2026 (מאיה): "יש שם בסוף דף צילום, תמחקי אותו לגמרי, הוא מבלבל"
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
