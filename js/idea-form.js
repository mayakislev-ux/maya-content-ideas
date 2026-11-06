import { validateIdea, CATEGORIES, CATEGORY_DEFINITIONS, PERSUASION_STAGE_DEFINITIONS, PERSUASION_STAGES, AUDIENCE_SCOPES, categoryColorVar, categoryIcon } from './ideas-logic.js';
import { addIdea, updateIdea, deleteIdea, restoreIdea } from './ideas-store.js';
import { functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { showToast } from './toast.js';
import { alertDialog, confirmDialog } from './confirm-dialog.js';
import { getCurrentIdeas } from './archive-view.js';
import { wireRecorderEntry, setRecorderEntryVisible } from './idea-recorder.js';

const classifyIdea = httpsCallable(functions, 'classifyIdea');
const AI_OPTION = '__ai__';

let editingId = null;
/* הרעיון שנפתח לעריכה, כמו שהוא במאגר. בטופס הקצר שולחים רק את מה
   שמוצג (הרעיון, הסוג והלינק), כדי ששדות שהוסתרו לא יידרסו בערך ריק. */
let editingIdea = null;

/* ---------- הטופס הקצר ----------
   06/11/2026 (מאיה: "את החלק של חייב לצלם שווה לצלם - להוריד לגמרי.
   כשמזינים רעיון לא צריך פורמט הנגשה מיותר. וגם סדרת פרקים תמחקי.
   כשמזינים רעיון את כל שאר הסינונים שיסמן לבד כבר... רק תשאירי מקום
   ללינק במידת הצורך להשראה"). מוצג לפי אותו מתג של מסך הרעיונות
   (ideasRedesignFor), ולשאר הלקוחות הטופס לא השתנה. */
let simpleForm = false;
const CLASSIFY_TIMEOUT_MS = 12000;
const LINK_LABEL_FULL = 'לינק לסרטון (אופציונלי)';
const LINK_LABEL_SIMPLE = 'לינק להשראה (אופציונלי)';

export function setSimpleIdeaForm(on) {
  simpleForm = Boolean(on);
  const form = document.getElementById('idea-form');
  if (form) form.classList.toggle('idea-form--simple', simpleForm);
  /* "כך זה ייראה ברשימה" רק חוזר על מה שמקלידים, ובטופס הקצר בטלפון
     הוא דוחף את תיבת הרעיון למטה בלי לתת כלום */
  const modal = document.getElementById('idea-modal');
  if (modal) modal.classList.toggle('idea-modal--simple', simpleForm);
  const linkLabel = document.getElementById('field-link-label');
  if (linkLabel) linkLabel.textContent = simpleForm ? LINK_LABEL_SIMPLE : LINK_LABEL_FULL;
  const catLabel = document.getElementById('category-label-text');
  if (catLabel) catLabel.textContent = simpleForm ? 'סוג התוכן' : 'איזה סוג רעיון זה? *';
  const subhint = document.getElementById('category-subhint');
  if (subhint) subhint.textContent = simpleForm ? 'זוהה לבד. אפשר לתקן בלחיצה' : 'בוחרים אחת';
  /* "🎙️ לספר בקול" כבר במסך הבית, ולכן לא בטופס הקצר */
  setRecorderEntryVisible(!simpleForm && !editingId);
}

/** מבטיח תשובה תוך ms: אחרת onTimeout מחליט (null או שגיאה). הטיימר
    מתנקה כשהתשובה מגיעה, כדי לא להשאיר טיימרים תלויים. */
function within(promise, ms, onTimeout) {
  let timer = null;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => onTimeout(resolve, reject), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** סיווג אוטומטי של רעיון לפי הטקסט שלו. אותה פונקציה שכפתור "שה-AI
    יזהה" משתמש בה. תקלה או המתנה ארוכה מחזירות null, והרעיון נשמר בלי
    סיווג (טיוטה) במקום ללכת לאיבוד. */
async function autoClassify(title) {
  try {
    const result = await within(classifyIdea({ title }), CLASSIFY_TIMEOUT_MS, (resolve) => resolve(null));
    const d = (result && result.data) || {};
    return {
      category: CATEGORIES.includes(d.category) ? d.category : '',
      persuasionStage: PERSUASION_STAGES.includes(d.persuasionStage) ? d.persuasionStage : '',
      audienceScope: AUDIENCE_SCOPES.includes(d.audienceScope) ? d.audienceScope : '',
    };
  } catch (err) {
    console.error('autoClassify failed:', err);
    return null;
  }
}

/** הנתונים שנשמרים מהטופס הקצר. בהוספה: הרעיון, הלינק והסיווג.
    בעריכה: רק מה שמוצג או חסר, כדי לא לדרוס שדות ישנים שלא מוצגים. */
async function simpleFormData(original) {
  const title = document.getElementById('field-title').value;
  const sourceLink = document.getElementById('field-link').value;
  const chosen = document.getElementById('field-category').value;
  const base = original || {};
  const hasCategory = CATEGORIES.includes(chosen) || chosen === 'ערכי';
  const needs = {
    category: !hasCategory,
    persuasionStage: !base.persuasionStage,
    audienceScope: !base.audienceScope,
  };
  let classified = null;
  if (needs.category || needs.persuasionStage || needs.audienceScope) {
    classified = await autoClassify(title);
  }
  const data = { title, sourceLink };
  if (original) {
    if (hasCategory) data.category = chosen;
    else if (classified && classified.category) data.category = classified.category;
    for (const key of ['persuasionStage', 'audienceScope']) {
      if (needs[key] && classified && classified[key]) data[key] = classified[key];
    }
  } else {
    data.category = hasCategory ? chosen : ((classified && classified.category) || '');
    data.persuasionStage = (classified && classified.persuasionStage) || '';
    data.audienceScope = (classified && classified.audienceScope) || '';
  }
  return { data, classifyFailed: needs.category && !(classified && classified.category) };
}
// מצב הטופס ברגע הפתיחה, כדי לדעת אם נכתב בו משהו (04/11/2026)
let openedSnapshot = '';

const FORM_FIELD_IDS = [
  'field-title', 'field-category', 'field-rating', 'field-link', 'field-persuasion',
  'field-audience-scope', 'field-format', 'field-series-name', 'field-series-order',
];

function formSnapshot() {
  const values = FORM_FIELD_IDS.map((id) => {
    const el = document.getElementById(id);
    return el ? el.value : '';
  });
  const series = document.getElementById('field-is-series');
  values.push(series && series.checked ? '1' : '');
  return JSON.stringify(values);
}

function formChanged() {
  return formSnapshot() !== openedSnapshot;
}

function setCategoryChip(value) {
  document.getElementById('field-category').value = value;
  document.querySelectorAll('.category-chip').forEach((chip) => {
    const isActive = chip.dataset.value === value;
    chip.classList.toggle('active', isActive);
    chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  updateIdeaPreview();
}

function setRatingChip(value) {
  document.getElementById('field-rating').value = value;
  document.querySelectorAll('.rating-chip').forEach((chip) => {
    const isActive = chip.dataset.value === value;
    chip.classList.toggle('active', isActive);
    chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  updateIdeaPreview();
}

// הקלדת שם הסדרה בחופשיות בכל פרק חדש היא ידית לטעויות שקטות - שגיאת
// כתיב אחת ("הדרך ל100K" במקום "הדרך ל-100K") יוצרת בפועל שתי סדרות
// שונות שלא מתחברות זו לזו, בלי שום שגיאה שמתריעה על זה. datalist טבעי
// של הדפדפן מציע את שמות הסדרות הקיימות תוך כדי הקלדה (עדיין מאפשר
// להקליד שם חדש) - בלי לבנות רכיב UI מותאם אישית.
function populateSeriesDatalist() {
  const names = new Set(getCurrentIdeas().map((idea) => idea.series).filter(Boolean));
  const datalist = document.getElementById('field-series-datalist');
  datalist.innerHTML = '';
  [...names].sort().forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    datalist.appendChild(option);
  });
}

// Live "how this will look in the list" preview - a quick confidence check
// after filling in the form, instead of only finding out at the list screen
// after saving. Reads straight from the form fields, so it's always in sync
// with whatever's currently selected, no separate state to keep in sync.
function updateIdeaPreview() {
  const title = document.getElementById('field-title').value.trim();
  const category = document.getElementById('field-category').value;
  const rating = document.getElementById('field-rating').value;

  const swatch = document.getElementById('idea-preview-swatch');
  const titleEl = document.getElementById('idea-preview-title');
  const ratingEl = document.getElementById('idea-preview-rating');

  swatch.style.background = category ? categoryColorVar(category) : 'var(--border-color)';
  titleEl.textContent = title || 'כך זה ייראה ברשימה';
  ratingEl.textContent = rating ? rating.split(' ')[0] : (category ? categoryIcon(category) : '');
}

export function openAddModal(prefillTitle = '') {
  editingId = null;
  document.getElementById('modal-title').textContent = 'רעיון חדש';
  document.getElementById('modal-breadcrumb-current').textContent = 'רעיון חדש';
  document.getElementById('idea-form').reset();
  setCategoryChip('');
  setRatingChip('');
  if (prefillTitle) document.getElementById('field-title').value = prefillTitle;
  // form.reset() לא נוגע ב-hidden שנקבע ידנית ב-JS (רק בערכי input) - צריך
  // להסתיר את שדות הסדרה במפורש, אחרת רעיון חדש "יורש" מצב פתוח משאיר
  // הקודם שנערך.
  document.getElementById('field-series-fields').hidden = true;
  populateSeriesDatalist();
  document.getElementById('delete-idea-btn').hidden = true;
  editingIdea = null;
  /* בטופס הקצר הסוג נבחר לבד בשמירה, ולכן בהוספה הוא לא מוצג בכלל */
  document.getElementById('category-section').hidden = simpleForm;
  setRecorderEntryVisible(!simpleForm);
  document.getElementById('form-error').hidden = true;
  document.getElementById('idea-modal').hidden = false;
  updateIdeaPreview();
  openedSnapshot = formSnapshot();
}

export function openEditModal(idea, overrideTitle = '') {
  editingId = idea.id;
  document.getElementById('modal-title').textContent = 'עריכת רעיון';
  document.getElementById('modal-breadcrumb-current').textContent = 'עריכת רעיון';
  document.getElementById('field-title').value = overrideTitle || idea.title;
  setCategoryChip(idea.category);
  setRatingChip(idea.rating || '');
  document.getElementById('field-link').value = idea.sourceLink || '';
  document.getElementById('field-persuasion').value = idea.persuasionStage || '';
  document.getElementById('field-audience-scope').value = idea.audienceScope || '';
  document.getElementById('field-format').value = idea.format || '';
  const isSeries = Boolean(idea.series);
  document.getElementById('field-is-series').checked = isSeries;
  document.getElementById('field-series-fields').hidden = !isSeries;
  populateSeriesDatalist();
  document.getElementById('field-series-name').value = idea.series || '';
  document.getElementById('field-series-order').value = idea.seriesOrder || '';
  document.getElementById('delete-idea-btn').hidden = false;
  editingIdea = idea;
  /* בעריכה רואים את הסוג שזוהה ואפשר לתקן אותו בלחיצה על אחד משלושת הצבעים */
  document.getElementById('category-section').hidden = false;
  setRecorderEntryVisible(false);
  document.getElementById('form-error').hidden = true;
  document.getElementById('idea-modal').hidden = false;
  updateIdeaPreview();
  openedSnapshot = formSnapshot();
}

export function closeModal() {
  document.getElementById('idea-modal').hidden = true;
  editingId = null;
  editingIdea = null;
}

/* 04/11/2026 (ביקורת): בטלפון הטופס הארוך נסגר בנגיעה ברקע, וכל מה
   שנכתב נעלם. סגירה בלי שמירה (רקע, ביטול או X) שואלת עכשיו קודם, אם
   באמת נכתב או השתנה משהו. */
async function closeModalAsking() {
  if (formChanged()) {
    const ok = await confirmDialog('לסגור בלי לשמור? מה שנכתב כאן יימחק.', {
      okLabel: 'לסגור בלי לשמור',
      cancelLabel: 'להמשיך לכתוב',
    });
    if (!ok) return;
  }
  closeModal();
}

function openInfoModal(title, definitions) {
  document.getElementById('info-modal-title').textContent = title;
  const body = document.getElementById('info-modal-body');
  body.innerHTML = '';
  for (const [key, def] of Object.entries(definitions)) {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = key;
    p.appendChild(strong);
    p.appendChild(document.createElement('br'));
    p.appendChild(document.createTextNode(def));
    body.appendChild(p);
  }
  document.getElementById('info-modal').hidden = false;
}

function wireInfoModal() {
  document.getElementById('category-info-btn').addEventListener('click', () => {
    openInfoModal('מה כל קטגוריה אומרת?', CATEGORY_DEFINITIONS);
  });
  document.getElementById('persuasion-info-btn').addEventListener('click', () => {
    openInfoModal('מה כל שלב שכנוע אומר?', PERSUASION_STAGE_DEFINITIONS);
  });
  const infoModal = document.getElementById('info-modal');
  document.getElementById('info-modal-close-btn').addEventListener('click', () => {
    infoModal.hidden = true;
  });
  infoModal.addEventListener('click', (e) => {
    if (e.target === infoModal) infoModal.hidden = true;
  });
}

async function runAiClassification() {
  const titleEl = document.getElementById('field-title');
  const persuasionSelect = document.getElementById('field-persuasion');
  const aiChip = document.querySelector('.category-chip-ai');

  if (!titleEl.value.trim()) {
    // persuasionSelect.value כבר הפך ל-AI_OPTION ברגע שהמשתמש/ת בחר/ה
    // באפשרות הזו בתפריט (לפני שהקוד הזה בכלל רץ) - בלי לאפס אותו כאן, ערך
    // שבור "__ai__" נשאר תקוע בשדה ועובר לשמירה כאילו הוא ערך חוקי.
    if (persuasionSelect.value === AI_OPTION) persuasionSelect.value = '';
    alertDialog('קודם תכתבו את "הרעיון", ואז אני אוכל להציע.');
    return;
  }

  const originalChipText = aiChip.textContent;
  aiChip.textContent = '🤖 חושב/ת...';
  aiChip.disabled = true;
  persuasionSelect.disabled = true;

  try {
    const result = await classifyIdea({ title: titleEl.value });
    setCategoryChip(result.data.category);
    persuasionSelect.value = result.data.persuasionStage;
    openInfoModal('ה-AI הציע/ה', {
      [result.data.category]: 'קטגוריה מוצעת לפי מה שכתבת.',
      [result.data.persuasionStage]: 'שלב שכנוע מוצע לפי מה שכתבת. את/ה תמיד יכול/ה לשנות ידנית.',
    });
  } catch (err) {
    console.error('classifyIdea failed:', err);
    if (persuasionSelect.value === AI_OPTION) persuasionSelect.value = '';
    const hasHebrewText = /[֐-׿]/.test(err.message || '');
    alert(hasHebrewText ? err.message : 'משהו השתבש בהצעה האוטומטית, נסו שוב או בחרו ידנית.');
  } finally {
    aiChip.textContent = originalChipText;
    aiChip.disabled = false;
    persuasionSelect.disabled = false;
  }
}

export function wireIdeaForm() {
  wireInfoModal();
  /* 06/11/2026: "🎙️ לספר בקול ולמצוא רעיונות" מעל תיבת הרעיון */
  wireRecorderEntry({ onCloseIdeaModal: closeModal });
  document.getElementById('cancel-idea-btn').addEventListener('click', closeModalAsking);
  document.getElementById('idea-modal-close-x').addEventListener('click', closeModalAsking);

  const ideaModal = document.getElementById('idea-modal');
  ideaModal.addEventListener('click', (e) => {
    if (e.target === ideaModal) closeModalAsking();
  });

  const titleInput = document.getElementById('field-title');
  const titleHint = document.getElementById('field-title-hint');
  titleInput.addEventListener('input', () => {
    titleHint.hidden = titleInput.value.length <= 280;
    updateIdeaPreview();
  });

  document.getElementById('delete-idea-btn').addEventListener('click', async () => {
    if (!editingId) return;
    const deletedId = editingId;
    try {
      await deleteIdea(deletedId);
    } catch (err) {
      console.error('idea delete failed:', err);
      const errorEl = document.getElementById('form-error');
      errorEl.textContent = 'מחיקת הרעיון נכשלה, בדקו חיבור ונסו שוב';
      errorEl.hidden = false;
      return;
    }
    closeModal();
    showToast('הרעיון נמחק', {
      actionLabel: 'בטלו',
      onAction: () => restoreIdea(deletedId),
    });
  });

  document.querySelectorAll('.category-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (chip.dataset.value === AI_OPTION) {
        runAiClassification();
      } else {
        setCategoryChip(chip.dataset.value);
        chip.classList.remove('chip-pop');
        void chip.offsetWidth;
        chip.classList.add('chip-pop');
      }
    });
  });

  document.querySelectorAll('.rating-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      setRatingChip(chip.dataset.value);
      chip.classList.remove('chip-pop');
      void chip.offsetWidth;
      chip.classList.add('chip-pop');
    });
  });

  document.getElementById('field-is-series').addEventListener('change', (e) => {
    document.getElementById('field-series-fields').hidden = !e.target.checked;
  });

  document.getElementById('field-persuasion').addEventListener('change', (e) => {
    const stage = e.target.value;
    if (stage === AI_OPTION) {
      runAiClassification();
      return;
    }
    if (stage && PERSUASION_STAGE_DEFINITIONS[stage]) {
      openInfoModal('שלב שכנוע שנבחר', { [stage]: PERSUASION_STAGE_DEFINITIONS[stage] + ' לתשומת ליבך: אם תשנו בהמשך את זווית ההנגשה לרעיון הזה, ייתכן שהשלב המתאים ישתנה בהתאם - כדאי לבדוק שוב.' });
    }
  });

  /* 05/11/2026 (מאיה): לחיצה כפולה, או Enter ואז לחיצה, בחיבור איטי שמרה
     את אותו רעיון פעמיים. כל עוד הכתיבה הראשונה לא חזרה, שליחה נוספת לא
     עושה כלום, וכפתור השמירה מושבת. */
  let savingIdea = false;
  document.getElementById('idea-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (savingIdea) return;
    if (simpleForm) {
      await submitSimple(e.currentTarget);
      return;
    }
    const isSeries = document.getElementById('field-is-series').checked;
    const seriesName = document.getElementById('field-series-name').value.trim();
    const seriesOrderRaw = document.getElementById('field-series-order').value;
    const data = {
      title: document.getElementById('field-title').value,
      category: document.getElementById('field-category').value,
      sourceLink: document.getElementById('field-link').value,
      persuasionStage: document.getElementById('field-persuasion').value,
      rating: document.getElementById('field-rating').value,
      audienceScope: document.getElementById('field-audience-scope').value,
      format: document.getElementById('field-format').value,
      // מסומן אבל בלי שם סדרה - מתייחסים כאילו לא סדרה בכלל, בלי להכשיל
      // את השמירה על שדה חובה חדש.
      series: isSeries && seriesName ? seriesName : '',
      seriesOrder: isSeries && seriesName && seriesOrderRaw ? Number(seriesOrderRaw) : null,
    };
    const errors = validateIdea(data);
    const errorEl = document.getElementById('form-error');
    if (errors.length) {
      errorEl.textContent = errors.join(', ');
      errorEl.hidden = false;
      return;
    }
    savingIdea = true;
    const submitBtn = e.currentTarget.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      /* 05/11/2026: בלי רשת Firestore לא מחזירה תשובה, והכפתור היה נשאר נעול
         לתמיד. אחרי 15 שניות משחררים ומראים את הודעת השגיאה הקיימת. */
      const write = editingId ? updateIdea(editingId, data) : addIdea(data);
      await Promise.race([
        write,
        new Promise((_, reject) => { setTimeout(() => reject(new Error('save timeout')), 15000); }),
      ]);
    } catch (err) {
      console.error('idea save failed:', err);
      errorEl.textContent = 'שמירת הרעיון נכשלה, בדקו חיבור ונסו שוב';
      errorEl.hidden = false;
      return;
    } finally {
      savingIdea = false;
      if (submitBtn) submitBtn.disabled = false;
    }
    closeModal();
    showToast('✓ הרעיון נשמר בהצלחה');
  });

  async function submitSimple(form) {
    const errorEl = document.getElementById('form-error');
    const title = document.getElementById('field-title').value;
    const early = validateIdea({ title }, { simple: true });
    if (early.length) {
      errorEl.textContent = early.join(', ');
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;
    savingIdea = true;
    const submitBtn = form.querySelector('button[type="submit"]');
    const submitText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'מזהה סוג ושומר...';
    }
    /* נלכדים עכשיו: אם הטופס נסגר בזמן הסיווג, שמירה לא תהפוך עריכה לרעיון חדש */
    const id = editingId;
    const original = editingIdea;
    const wasEditing = Boolean(id);
    try {
      const { data, classifyFailed } = await simpleFormData(original);
      const errors = validateIdea(data, { simple: true });
      if (errors.length) {
        errorEl.textContent = errors.join(', ');
        errorEl.hidden = false;
        return;
      }
      try {
        const write = id ? updateIdea(id, data) : addIdea(data);
        await within(write, 15000, (_, reject) => reject(new Error('save timeout')));
      } catch (err) {
        console.error('idea save failed:', err);
        errorEl.textContent = 'שמירת הרעיון נכשלה, בדקו חיבור ונסו שוב';
        errorEl.hidden = false;
        return;
      }
      closeModal();
      if (classifyFailed) {
        showToast('✓ הרעיון נשמר. את הסוג לא הצלחנו לזהות כרגע, הוא מחכה ב"עוד לא סווגו" ואפשר לבחור אותו שם', { duration: 7000 });
      } else if (!wasEditing && data.category) {
        showToast(`✓ הרעיון נשמר תחת "${data.category}"`);
      } else {
        showToast('✓ הרעיון נשמר בהצלחה');
      }
    } finally {
      savingIdea = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitText;
      }
    }
  }
}
