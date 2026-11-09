/* 07/11/2026 (ביקורת): לקוחות לא יכלו לתקן את התחום ואת קהל היעד אחרי
   הפעם הראשונה. העורך היחיד היה בבונה תוכנית התוכן, שכבר לא נגיש.
   "הפרטים שלי" בתפריט פותח את החלון הזה: התחום, קהל היעד, והתחום
   לרפרנסים (videoAssistantDomain/SubCategory), אותו שדה שהעוזר לסרטון
   ו"לשכפל רפרנס" קוראים. */
import { getProfile, saveProfile } from './user-profile.js';
import { showToast } from './toast.js';
import { serverErrorText } from './server-error.js';
import { SUBCATEGORIES_BY_DOMAIN } from './video-assistant.js';
import { cacheDomainInfoLocally } from './video-assistant-fx.js';

const el = (id) => document.getElementById(id);
let onSavedOnce = null;
let busy = false;

function fillOptions(select, values, selected, emptyLabel) {
  select.innerHTML = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = emptyLabel;
  select.appendChild(empty);
  for (const v of values) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    if (v === selected) o.selected = true;
    select.appendChild(o);
  }
  if (!selected || !values.includes(selected)) select.value = '';
}

function fillSubs(domain, selected) {
  const subs = SUBCATEGORIES_BY_DOMAIN[domain] || [];
  el('my-details-sub-wrap').hidden = !subs.length;
  fillOptions(el('my-details-sub'), subs, selected, 'כל התחום');
}

function showError(text) {
  const box = el('my-details-error');
  box.textContent = text;
  box.hidden = !text;
}

function close() {
  el('my-details-modal').hidden = true;
  onSavedOnce = null;
}

/** פותח את החלון. onSaved רץ אחרי שמירה שהצליחה (למשל לנסות שוב רפרנס). */
export async function openMyDetails({ onSaved = null } = {}) {
  onSavedOnce = typeof onSaved === 'function' ? onSaved : null;
  showError('');
  const modal = el('my-details-modal');
  const save = el('my-details-save-btn');
  save.disabled = true;
  modal.hidden = false;
  let profile = {};
  try {
    profile = (await getProfile()) || {};
  } catch (err) {
    console.error('my-details: getProfile failed', err);
    /* בלי הפרטים השמורים לא שומרים, אחרת שדות ריקים היו דורסים את מה שיש */
    showError(`${serverErrorText(err, 'טעינת הפרטים')} אפשר לסגור ולפתוח שוב.`);
    return;
  }
  el('my-details-business').value = profile.business || '';
  el('my-details-primary').value = profile.primaryAudience || '';
  /* 09/11/2026: קהל שנלקח מהטבלה שאושרה בפורטל (functions/audience-from-table.js) */
  const fromTable = el('my-details-from-table');
  if (fromTable) fromTable.hidden = !['table', 'maya'].includes(profile.audienceSource);
  el('my-details-secondary').value = profile.secondaryAudience || '';
  fillOptions(el('my-details-domain'), Object.keys(SUBCATEGORIES_BY_DOMAIN), profile.videoAssistantDomain || '', 'לבחור תחום');
  fillSubs(el('my-details-domain').value, profile.videoAssistantSubCategory || '');
  save.disabled = false;
}

export function wireMyDetails() {
  const modal = el('my-details-modal');
  if (!modal || modal.dataset.wired) return;
  modal.dataset.wired = '1';
  el('tab-my-details').addEventListener('click', () => openMyDetails());
  el('my-details-close-btn').addEventListener('click', close);
  el('my-details-cancel-btn').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  el('my-details-domain').addEventListener('change', (e) => fillSubs(e.target.value, ''));
  el('my-details-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const domain = el('my-details-domain').value;
    const sub = el('my-details-sub-wrap').hidden ? '' : el('my-details-sub').value;
    const data = {
      business: el('my-details-business').value.trim(),
      primaryAudience: el('my-details-primary').value.trim(),
      secondaryAudience: el('my-details-secondary').value.trim(),
    };
    /* תחום שלא נבחר לא מוחק תחום שכבר שמור */
    if (domain) {
      data.videoAssistantDomain = domain;
      data.videoAssistantSubCategory = sub || null;
    }
    busy = true;
    el('my-details-save-btn').disabled = true;
    showError('');
    try {
      await saveProfile(data);
    } catch (err) {
      console.error('my-details: saveProfile failed', err);
      showError(serverErrorText(err, 'שמירת הפרטים'));
      return;
    } finally {
      busy = false;
      el('my-details-save-btn').disabled = false;
    }
    if (domain) {
      const info = { domain, subCategory: sub || null };
      cacheDomainInfoLocally(info);
      window.dispatchEvent(new CustomEvent('moach-domain-changed', { detail: info }));
    }
    const after = onSavedOnce;
    close();
    showToast('✓ הפרטים נשמרו');
    if (after) {
      try { after(); } catch (err) { console.error('my-details: onSaved failed', err); }
    }
  });
}
