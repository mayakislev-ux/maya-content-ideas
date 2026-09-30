// 30/09/2026 (מאיה): "קודם זה מעביר אותן לדף מסודר כמו טבלה, אולי צריך UI UX
// חזק, ששם הן צריכות לעשות עוד עבודה ולמלא, אין מה לעשות... ורק אז אחרי שיש
// טבלה יהיה למעלה כפתור של לבנות תכנית ולאיזה קהל".
//
// המסך הזה בא לפני בניית התוכנית ולא במקומה. הוא מראה מה כבר נשלף מהקובץ
// האישי, מבקש במקום את מה שאף גיליון לא יכול להכיל, ופותח את כפתור הבנייה
// רק כשהכל שם.
//
// כל ההיגיון הטהור נמצא ב-story-table-render.js ונבדק שם. כאן נשארו רק
// אירועים, טעינה ושמירה.

import { loadStoryTable, syncStoryTable, saveOverride } from './story-table-store.js';
import {
  renderStoryTable,
  planChoicesHtml,
  planInputs,
  selectedAudience,
} from './story-table-render.js';
import { showToast } from './toast.js';

const state = { table: null, audienceId: null, busy: false };

function el(id) {
  return document.getElementById(id);
}

function refresh({ keepFocus = null } = {}) {
  const host = el('story-table');
  if (!host) return;
  host.innerHTML = renderStoryTable(state.table, state.audienceId);
  if (!keepFocus) return;
  const again = host.querySelector(`.st-input[data-row="${keepFocus}"]`);
  const field = again && again.closest('.st-field');
  if (field && !field.hidden) again.focus();
}

function setSaved(input, ok) {
  const row = input.closest('.st-row');
  if (!row) return;
  row.classList.toggle('is-saved', ok === true);
  row.classList.toggle('is-savefail', ok === false);
}

/** שמירה על יציאה מהשדה, ולא בכל הקלדה - זה היה כותב ל-Firestore בכל אות */
async function persist(input) {
  const audience = selectedAudience(state.table, state.audienceId);
  if (!audience) return;
  const key = input.dataset.row;
  const text = input.value.trim();
  // כל עריכה היא override. אין יותר שדות שמבקשים תוכן, ולכן אין "answers"
  // חדשים - המילים שלה תמיד באות במקום מה שהוצג, או נוספות עליו.
  const bucket = state.table.overrides;
  const before = (bucket[audience.id] || {})[key] || '';
  if (before.trim() === text) return;

  bucket[audience.id] = { ...(bucket[audience.id] || {}), [key]: text };
  try {
    await saveOverride(audience.id, key, text);
    setSaved(input, true);
    refresh({ keepFocus: key });
  } catch (err) {
    console.error('story table save failed:', err);
    // מחזירים את המצב הקודם, אחרת המסך מראה שנשמר משהו שלא נשמר
    bucket[audience.id][key] = before;
    setSaved(input, false);
    showToast('לא הצלחנו לשמור. אפשר לנסות שוב.');
  }
}

function openPlanSheet() {
  const sheet = el('st-plan-sheet');
  const choices = el('st-plan-choices');
  if (!sheet || !choices || !state.table) return;
  choices.innerHTML = planChoicesHtml(state.table, state.audienceId);
  sheet.hidden = false;
}

/**
 * בניית התוכנית.
 *
 * ממלאת את שלושת השדות שהטופס הקיים ממילא מקבל ושולחת אותו. כך כל מה
 * שעובד היום - הסטרימינג, הניסיון החוזר, השמירה והצגת התוכנית - נשאר
 * בדיוק כמו שהוא, ורק מה שנכנס לפרומפט משתנה.
 */
function buildPlan(audienceId) {
  const audience = selectedAudience(state.table, audienceId);
  const form = el('warming-form');
  if (!audience || !form) return;
  const inputs = planInputs(audience, state.table);
  el('warming-product').value = inputs.product;
  el('warming-audience').value = inputs.audience;
  el('warming-context').value = inputs.extraContext;
  el('st-plan-sheet').hidden = true;
  el('story-table-panel').hidden = true;
  if (form.requestSubmit) form.requestSubmit();
  else form.dispatchEvent(new Event('submit', { cancelable: true }));
}

function showStatus(text, warn = false) {
  const status = el('st-status');
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || '';
  status.className = warn ? 'st-status st-status--warn' : 'st-status';
}

/**
 * 30/09/2026 (מאיה, כשראתה את המסך): "לא רוצה ששימו לינק לקובץ, רוצה
 * שאוטומטי כבר לכל אחת יהיה את הטבלה שבנויה מהקובץ שלה שכבר מסונכרן, סתם
 * בלאגן".
 *
 * לכן אין יותר שדה להדבקת קישור. כשאין טבלה, המסך חוזר בשקט לטופס הישן
 * ומציג שורה אחת מסבירה, במקום לבקש ממנה לעשות עבודה של חיבור קבצים.
 */
function fallbackToForm(message) {
  el('story-table').innerHTML = '';
  el('warming-form').hidden = false;
  showStatus(message, false);
}

async function runSync() {
  if (state.busy) return;
  state.busy = true;
  showStatus('קוראים את הקובץ שלך...');
  try {
    const res = await syncStoryTable();
    if (!res.ready) {
      fallbackToForm(
        res.reason === 'no-sheet'
          ? 'הקובץ האישי שלך עוד לא מחובר כאן. אפשר לבנות תוכנית גם בלעדיו, ומאיה תחבר אותו.'
          : res.message || 'לא הצלחנו לבנות את הטבלה מהקובץ שלך.'
      );
      return;
    }
    const saved = await loadStoryTable();
    state.table = saved || { audiences: res.audiences, answers: {}, overrides: {} };
    state.audienceId = (state.table.audiences[0] || {}).id || null;
    showStatus('');
    el('warming-form').hidden = true;
    el('st-resync-btn').hidden = false;
    refresh();
  } catch (err) {
    console.error('syncStoryTable failed:', err);
    fallbackToForm('לא הצלחנו לקרוא את הקובץ כרגע. אפשר לבנות תוכנית גם בלעדיו.');
  } finally {
    state.busy = false;
  }
}

export async function wireStoryTableView() {
  const panel = el('story-table-panel');
  const sheet = el('st-plan-sheet');
  if (!panel || !sheet) return;

  panel.addEventListener('click', (e) => {
    const pill = e.target.closest('.st-pill');
    if (pill) {
      state.audienceId = pill.dataset.audience;
      refresh();
      return;
    }
    const edit = e.target.closest('.st-edit');
    if (edit) {
      const field = edit.closest('.st-row').querySelector('.st-field');
      field.hidden = false;
      edit.hidden = true;
      field.querySelector('textarea').focus();
      return;
    }
    if (e.target.closest('#st-build-btn')) openPlanSheet();
    else if (e.target.closest('#st-resync-btn')) runSync();
  });

  // blur לא עולה למעלה, ולכן capture
  panel.addEventListener(
    'blur',
    (e) => {
      if (e.target.classList && e.target.classList.contains('st-input')) persist(e.target);
    },
    true
  );

  sheet.addEventListener('click', (e) => {
    if (e.target === sheet || e.target.closest('#st-plan-close')) {
      sheet.hidden = true;
      return;
    }
    const choice = e.target.closest('.st-choice');
    if (choice && !choice.disabled) buildPlan(choice.dataset.audience);
  });

  try {
    const saved = await loadStoryTable();
    if (saved && saved.audiences.length) {
      state.table = saved;
      state.audienceId = saved.audiences[0].id;
      el('warming-form').hidden = true;
      el('st-resync-btn').hidden = false;
      refresh();
      return;
    }
  } catch (err) {
    console.error('loadStoryTable failed:', err);
  }
  runSync();
}
