/* "התסריטים שלי": החלון עם כל הסרטונים שנבנו בעוזר.

   29/10/2026 (מאיה): "שיהיה בצד כפתור 'התסריטים שלי', ואז כל פעם זה ישמור
   את כל מה שהיא כותבת, ויהיה לה אופציה גם לערוך/למחוק".

   04/11/2026 (מאיה), שלוש הערות:
   1. "אני רוצה שיהיה שם אפשרות לערוך במידת הצורך". כל סרטון נפתח לקריאה,
      ובכפתור "לערוך" כל החלקים הופכים לתיבות, עם "לשמור" ו"ביטול". גם
      הסרטון שפתוח עכשיו בעוזר נערך כאן, והשינוי עובר גם לעוזר.
   2. "אפילו קליק הכי קטן במסך והחלונית כל שניה נסגרת". החלון נסגר רק
      ב-✕ או ב-Escape, ולא כשיש שינויים שלא נשמרו בלי לשאול.
   3. "שיופיע כל תהליך היצירה ושממש יופיע שם גם את שלב המגילת אסתר". כל
      סרטון מוצג כמסלול: הרעיון, המסר, האריזה, הפורמט, הרפרנס, מגילת
      אסתר, ההוק והתסריט, לפי הסדר שבו נבנו. רק מה שבאמת נכתב.

   הכל נשמר כבר מ-29/10 כחלק מהסטייט המלא של הפריט (scriptDoc), כולל
   herWords ו-rawDump, ולכן גם סרטונים ישנים מציגים את המגילה שלהם. */

import { scriptDoc, scriptTitle, syncIdea } from './video-assistant-build.js';

const isFootage = (s) => s.branch === 'footage' || !!s.footageKind;
const filled = (s, f) => !!(f && typeof s[f] === 'string' && s[f].trim());
const firstFilled = (s, ...fs) => fs.find((f) => filled(s, f)) || null;

/* כל שלב: השם שלו, והשדה בסטייט שמחזיק אותו. long נפתח בלחיצה, כדי שהחלון
   לא יהיה קיר של טקסט. */
const STEPS = {
  idea: {
    label: 'הרעיון',
    field: (s) => (filled(s, 'ideaTopic') ? 'ideaTopic'
      : (!filled(s, 'ideaPunchline') && !isFootage(s) ? firstFilled(s, 'ideaBeforePackaging', 'ideaDescription') : null)),
  },
  message: {
    label: 'המסר',
    field: (s) => (filled(s, 'ideaPunchline') ? 'ideaPunchline'
      : (isFootage(s) ? firstFilled(s, 'ideaBeforePackaging', 'ideaDescription') : null)),
  },
  packaging: {
    label: 'האריזה',
    field: () => 'packaging',
    note: (s) => (s.startingPoint ? `נקודת היציאה: ${s.startingPoint}` : ''),
  },
  format: { label: 'הפורמט', field: () => 'selectedFormat' },
  refLink: { label: 'הסרטון ששוכפל', field: () => 'referenceLink', link: true },
  transcript: { label: 'התמלול של הרפרנס', field: () => 'transcript', long: true },
  /* בכתיבה מאפס המגילה היא rawDump, בשכפול היא herWords. בקטע שצולם
     herWords הוא הטקסט הסופי, ולכן שם הוא נכנס תחת התסריט. */
  megillah: {
    label: 'מגילת אסתר',
    field: (s) => (filled(s, 'rawDump') ? 'rawDump' : (s.branch !== 'footage' ? 'herWords' : null)),
    long: true,
  },
  hook: { label: 'ההוק', field: () => 'hook', big: true },
  reinforce: { label: 'חיזוק ההוק', field: () => 'hookReinforcement' },
  /* כמו finalScriptText במסך הסיכום */
  script: {
    label: 'התסריט הסופי',
    field: (s) => (s.branch === 'footage' ? 'herWords'
      : (s.branch === 'scratch' ? firstFilled(s, 'draftScript', 'finalScript') : firstFilled(s, 'finalScript', 'draftScript'))),
    script: true,
  },
};

const ORDER = {
  idea: ['idea', 'message', 'packaging', 'format', 'script'],
  scratch: ['idea', 'message', 'packaging', 'format', 'megillah', 'refLink', 'transcript', 'hook', 'reinforce', 'script'],
  footage: ['message', 'packaging', 'format', 'script'],
  reference: ['refLink', 'transcript', 'megillah', 'hook', 'script'],
  'idea-search': ['idea', 'message', 'packaging', 'format', 'refLink', 'transcript', 'megillah', 'hook', 'script'],
};

/** כל תהליך היצירה של סרטון, לפי הסדר, רק החלקים שבאמת נכתבו. */
export function scriptJourney(state) {
  const s = state || {};
  const keys = ORDER[s.branch] || ORDER['idea-search'];
  const used = new Set();
  const out = [];
  for (const key of keys) {
    const step = STEPS[key];
    const field = step.field(s);
    if (!filled(s, field) || used.has(field)) continue;
    used.add(field);
    out.push({
      key,
      label: key === 'script' && s.branch === 'footage' ? 'הטקסט הסופי' : step.label,
      field,
      value: s[field],
      note: step.note ? step.note(s) : '',
      long: !!step.long,
      link: !!step.link,
      big: !!step.big,
      script: !!step.script,
    });
  }
  return out;
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const countWords = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;

function libDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })} · ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

const HEADING = '<h2 style="margin-top:0">📝 התסריטים שלי</h2>';

/**
 * deps:
 *   getState()            הסטייט של העוזר עכשיו
 *   saveAll()             שמירת הסשן והפריט הפתוח
 *   store                 { listScripts, saveScript, deleteScript }
 *   openModal, closeModal מ-video-assistant-modal.js
 *   copyBtn, wireCopyButtons, confirmDialog, showToast
 *   resume(state, item)   לפתוח את הסרטון בעוזר
 *   applyLive(changes)    עריכה של הסרטון שפתוח עכשיו בעוזר
 *   liveDeleted()         הסרטון שפתוח עכשיו נמחק
 */
export function createScriptsLibrary(deps) {
  const { store } = deps;
  let opening = false;
  /* true כשיש בעריכה שינויים שעוד לא נשמרו */
  let dirty = false;

  const leaveOk = async () => {
    if (!dirty) return true;
    const ok = await deps.confirmDialog('יש שינויים שלא נשמרו. לצאת בלי לשמור אותם?', { okLabel: 'לצאת בלי לשמור', cancelLabel: 'להישאר ולשמור' });
    if (ok) dirty = false;
    return ok;
  };

  async function open() {
    if (opening) return;
    opening = true;
    deps.closeModal();
    try {
      await deps.saveAll();
    } catch (err) {
      console.error('saveSession failed:', err);
    }
    opening = false;
    deps.closeModal();
    dirty = false;
    const overlay = deps.openModal(`<div id="va-lib">${HEADING}<p>טוענים...</p></div>`, { backdropClose: false, beforeClose: leaveOk });
    overlay.querySelector('.cosmic-modal').classList.add('va-lib-modal');
    let items;
    try {
      items = await store.listScripts();
    } catch (err) {
      console.error('listScripts failed:', err);
      overlay.querySelector('#va-lib').innerHTML = `${HEADING}<p>לא הצלחנו לטעון את הרשימה. כדאי לבדוק שיש אינטרנט ולנסות שוב.</p>`;
      return overlay;
    }
    renderList(overlay, items);
    return overlay;
  }

  function renderList(overlay, items) {
    dirty = false;
    const box = overlay.querySelector('#va-lib');
    box.innerHTML = `${HEADING}
      ${items.length ? `<ul class="va-lib-list">${items.map((it) => `
        <li><button type="button" class="va-lib-item" data-id="${escapeHtml(it.id)}">
          <span class="va-lib-item__title">${escapeHtml(it.title || 'סרטון בלי שם')}</span>
          <span class="va-lib-item__meta">${it.done ? '✓ מוכן' : 'בבנייה'} · ${escapeHtml(libDate(it.updatedAt))}</span>
        </button></li>`).join('')}</ul>`
        : '<p>עוד אין כאן תסריטים. כל סרטון שמתחילים לבנות נשמר כאן לבד, תוך כדי כתיבה.</p>'}`;
    box.querySelectorAll('.va-lib-item').forEach((btn) => btn.addEventListener('click', () => {
      const item = items.find((it) => it.id === btn.getAttribute('data-id'));
      if (item) renderItem(overlay, items, item);
    }));
  }

  function stepViewHtml(step, i) {
    const text = step.link
      ? `<a href="${escapeHtml(step.value)}" target="_blank" rel="noopener" dir="ltr">${escapeHtml(step.value)}</a>`
      : escapeHtml(step.value);
    const head = `<span class="va-lib-step__num">${i + 1}</span><span class="va-lib-step__label">${escapeHtml(step.label)}</span>`;
    const note = step.note ? `<p class="va-lib-step__note">${escapeHtml(step.note)}</p>` : '';
    const cls = `va-lib-step${step.script ? ' is-script' : ''}${step.big ? ' is-big' : ''}`;
    if (step.long) {
      return `<li class="${cls}" data-step="${step.key}"><details>
        <summary>${head}<small class="va-lib-step__count">${countWords(step.value)} מילים</small></summary>
        <div class="va-lib-step__text">${text}</div>${note}
      </details></li>`;
    }
    return `<li class="${cls}" data-step="${step.key}">
      <div class="va-lib-step__head">${head}</div>
      <div class="va-lib-step__text">${text}</div>${note}
    </li>`;
  }

  function stepEditHtml(step, i) {
    const rows = step.script || step.long ? 8 : 2;
    return `<li class="va-lib-step is-editing" data-step="${step.key}">
      <label class="va-lib-step__head" for="va-lib-${step.key}"><span class="va-lib-step__num">${i + 1}</span><span class="va-lib-step__label">${escapeHtml(step.label)}</span></label>
      <textarea class="cosmic-textarea va-lib-field" id="va-lib-${step.key}" data-field="${step.field}" rows="${rows}"${step.link ? ' dir="ltr"' : ''}>${escapeHtml(step.value)}</textarea>
    </li>`;
  }

  function renderItem(overlay, items, item, { editing = false, saved = '' } = {}) {
    const box = overlay.querySelector('#va-lib');
    const live = deps.getState().scriptId === item.id;
    const base = live ? { ...deps.getState() } : { ...(item.state || {}) };
    const steps = scriptJourney(base);
    const script = steps.find((st) => st.script);
    dirty = false;
    box.innerHTML = `
      <button type="button" class="va-text-link" id="va-lib-back">→ לכל התסריטים</button>
      <h2 style="margin-top:4px">${escapeHtml(item.title || 'סרטון בלי שם')}</h2>
      <p class="va-lib-item__meta">${item.done ? '✓ מוכן' : 'בבנייה'} · ${escapeHtml(libDate(item.updatedAt))}</p>
      ${live ? '<p class="va-lib-live">זה הסרטון שפתוח עכשיו בעוזר. מה שנשמר כאן עובר גם לשם.</p>' : ''}
      ${steps.length
        ? `<ol class="va-lib-journey">${steps.map(editing ? stepEditHtml : stepViewHtml).join('')}</ol>`
        : '<p>עוד לא נכתב כאן חלק שלם. אפשר להמשיך לבנות מאיפה שעצרת.</p>'}
      <p class="va-lib-saved" id="va-lib-saved" role="status" aria-live="polite">${escapeHtml(saved)}</p>
      ${editing ? `<div class="cosmic-btn-row va-lib-edit-row">
          <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-lib-save">לשמור</button>
          <button type="button" class="cosmic-btn va-lib-cancel" id="va-lib-cancel">ביטול</button>
        </div>`
        : `${steps.length ? '<button type="button" class="va-lib-edit" id="va-lib-edit">✏️ לערוך</button>' : ''}
        ${script ? deps.copyBtn(script.value, 'להעתיק את התסריט') : ''}
        <div class="cosmic-btn-row" style="margin-top:12px">
          <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-lib-resume">${live ? 'חזרה לעוזר ←' : (item.done ? 'לפתוח בעוזר' : 'להמשיך לבנות ←')}</button>
          <button type="button" class="va-text-link va-lib-delete" id="va-lib-delete">למחוק את הסרטון הזה</button>
        </div>`}`;
    const savedEl = box.querySelector('#va-lib-saved');

    box.querySelector('#va-lib-back').addEventListener('click', async () => {
      if (!(await leaveOk())) return;
      renderList(overlay, items);
    });

    if (editing) {
      const fields = box.querySelectorAll('.va-lib-field');
      fields.forEach((ta) => ta.addEventListener('input', () => {
        dirty = true;
        savedEl.textContent = '';
        savedEl.classList.remove('is-error');
      }));
      box.querySelector('#va-lib-cancel').addEventListener('click', async () => {
        if (!(await leaveOk())) return;
        renderItem(overlay, items, item);
      });
      const saveBtn = box.querySelector('#va-lib-save');
      saveBtn.addEventListener('click', async () => {
        let s = live ? { ...deps.getState() } : { ...(item.state || {}) };
        const changes = {};
        fields.forEach((ta) => {
          const field = ta.getAttribute('data-field');
          if (ta.value === String(s[field] || '')) return;
          s = syncIdea({ ...s, [field]: ta.value }, field);
          changes[field] = ta.value;
        });
        saveBtn.disabled = true;
        saveBtn.textContent = 'שומרים...';
        const now = Date.now();
        const data = { ...scriptDoc(s, now), createdAt: item.createdAt || now };
        try {
          await store.saveScript(item.id, data);
        } catch (err) {
          console.error('saveScript failed:', err);
          saveBtn.disabled = false;
          saveBtn.textContent = 'לשמור';
          savedEl.textContent = 'השמירה לא עברה. כדאי לבדוק שיש אינטרנט ולנסות שוב';
          savedEl.classList.add('is-error');
          return;
        }
        Object.assign(item, { title: data.title, updatedAt: now, state: data.state });
        dirty = false;
        /* syncIdea מעדכן גם את ideaDescription, שהפרומפטים קוראים */
        if (live && Object.keys(changes).length) {
          const synced = {};
          for (const k of ['ideaDescription', 'ideaBeforePackaging']) if (s[k] !== deps.getState()[k]) synced[k] = s[k];
          deps.applyLive({ ...changes, ...synced });
        }
        renderItem(overlay, items, item, { saved: 'נשמר ✓' });
      });
      return;
    }

    if (steps.length) box.querySelector('#va-lib-edit').addEventListener('click', () => renderItem(overlay, items, item, { editing: true }));
    deps.wireCopyButtons(box);

    box.querySelector('#va-lib-resume').addEventListener('click', () => {
      if (live) { deps.closeModal(); return; }
      deps.resume({ ...(item.state || {}) }, item);
    });
    box.querySelector('#va-lib-delete').addEventListener('click', async () => {
      const ok = await deps.confirmDialog('למחוק את הסרטון הזה? אי אפשר להחזיר אותו אחר כך.', { okLabel: 'למחוק', cancelLabel: 'לא, להשאיר' });
      if (!ok) return;
      try {
        await store.deleteScript(item.id);
      } catch (err) {
        console.error('deleteScript failed:', err);
        deps.showToast('המחיקה לא עברה. כדאי לבדוק שיש אינטרנט');
        return;
      }
      /* הסרטון שפתוח עכשיו בעוזר נמחק: מתחילים נקי, אחרת השמירה הבאה הייתה
         מחזירה אותו לרשימה. */
      if (deps.getState().scriptId === item.id) deps.liveDeleted();
      const rest = items.filter((it) => it.id !== item.id);
      items.length = 0;
      items.push(...rest);
      renderList(overlay, items);
      deps.showToast('נמחק');
    });
  }

  return { open };
}
