import { db, auth } from './firebase-init.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const STEPS = [
  {
    emoji: '👋',
    title: 'ברוכות וברוכים הבאים!',
    body: '"המוח השיווקי שנמצא איתך 24/7" - בואו נכיר ב-30 שניות מה יש כאן ואיך להשתמש בזה נכון. לחצו על "הבא" כדי להתחיל.',
  },
  {
    target: '#tab-archive',
    emoji: '📂',
    title: 'הרעיונות שלי',
    body: 'כאן שומרים ומנהלים את כל רעיונות התוכן שלכם - עם חיפוש, סינון וסימון "בוצע" ברגע שצילמתם.',
  },
  {
    target: '.quick-add-box',
    emoji: '📝',
    title: 'הוספה מהירה',
    body: 'כאן אפשר לרשום טיוטת רעיון תוך שנייה, בלי למלא את כל הטופס - ולהשלים אותה בהמשך.',
  },
  {
    target: '#tab-chat',
    emoji: '🤖',
    title: 'בדיקת רעיון',
    body: 'צ\'אט עם AI שמדייק לכם רעיון לפי המתודולוגיה של מאיה, ומציע 5 זוויות הנגשה מתאימות.\n\n⚠️ חשוב מאוד: הצ\'אט מותאם ספציפית לתחום העסק אחד שהגדרתם בהיכרות הראשונה. אם תכתבו לו על תחום אחר לגמרי - הוא לא יוכל לעזור. שימו לב לכתוב רק על התחום שלכם.',
  },
  {
    target: '#tab-guide',
    emoji: '📖',
    title: 'איך למצוא רעיון',
    body: 'מדריך מלא של מאיה - 11 דרכים אמיתיות למצוא רעיונות לתוכן, גם כשנדמה שאין על מה לדבר.',
  },
  {
    target: '#tab-roadmap',
    emoji: '🗺️',
    title: 'מפת הדרכים ותכנית תוכן',
    body: 'שני כלים שעוזרים לקחת רעיון ולהפוך אותו לתוכן מוכן - מרעיון ועד פרסום, ותכנון קדימה.',
  },
  {
    target: '#tab-feedback',
    emoji: '💬',
    title: 'חוות דעת',
    body: 'נשמח לשמוע מה עובד ומה פחות - הפידבק אנונימי לגמרי ועוזר לנו לשפר.',
  },
  {
    emoji: '💜',
    title: 'זהו, בואו נתחיל!',
    body: 'עכשיו את/ה מכיר/ה את כל האפליקציה. בהצלחה!',
  },
];

let currentStep = 0;
let blocker, spotlight, callout;
let resizeHandler = null;

function isMobile() {
  return window.innerWidth <= 720;
}

function setDrawerOpen(open) {
  const nav = document.getElementById('view-tabs');
  const overlay = document.getElementById('menu-overlay');
  if (!nav || !overlay) return;
  if (!isMobile()) return;
  nav.classList.toggle('open', open);
  overlay.hidden = !open;
}

function buildElements() {
  blocker = document.createElement('div');
  blocker.className = 'tour-blocker';

  spotlight = document.createElement('div');
  spotlight.className = 'tour-spotlight';

  callout = document.createElement('div');
  callout.className = 'tour-callout';
  callout.innerHTML = `
    <div class="tour-callout-arrow"></div>
    <div class="tour-callout-emoji"></div>
    <h3></h3>
    <p></p>
    <div class="tour-callout-footer">
      <div class="tour-callout-dots"></div>
      <button type="button" class="tour-next-btn"></button>
    </div>
  `;

  document.body.append(blocker, spotlight, callout);
  callout.querySelector('.tour-next-btn').addEventListener('click', advance);
}

function positionForTarget(targetEl) {
  if (!targetEl) {
    spotlight.classList.add('no-target');
    spotlight.style.top = '';
    spotlight.style.left = '';
    spotlight.style.width = '';
    spotlight.style.height = '';
    const calloutWidth = Math.min(320, window.innerWidth - 32);
    callout.style.width = `${calloutWidth}px`;
    callout.style.left = `calc(50% - ${calloutWidth / 2}px)`;
    callout.style.top = '40%';
    callout.classList.remove('arrow-top', 'arrow-bottom');
    return;
  }

  spotlight.classList.remove('no-target');
  const rect = targetEl.getBoundingClientRect();
  const pad = 8;
  spotlight.style.top = `${rect.top - pad}px`;
  spotlight.style.left = `${rect.left - pad}px`;
  spotlight.style.width = `${rect.width + pad * 2}px`;
  spotlight.style.height = `${rect.height + pad * 2}px`;

  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const spaceBelow = viewportH - rect.bottom;
  const placeBelow = spaceBelow > 220 || rect.top < 220;

  callout.classList.toggle('arrow-top', placeBelow);
  callout.classList.toggle('arrow-bottom', !placeBelow);

  const calloutWidth = Math.min(320, viewportW - 32);
  let left = rect.left + rect.width / 2 - calloutWidth / 2;
  left = Math.max(16, Math.min(left, viewportW - calloutWidth - 16));
  callout.style.left = `${left}px`;
  callout.style.width = `${calloutWidth}px`;

  if (placeBelow) {
    callout.style.top = `${rect.bottom + pad + 12}px`;
  } else {
    callout.style.top = 'auto';
    requestAnimationFrame(() => {
      const calloutHeight = callout.offsetHeight;
      callout.style.top = `${rect.top - pad - 12 - calloutHeight}px`;
    });
  }
}

function renderStep() {
  const step = STEPS[currentStep];
  callout.querySelector('.tour-callout-emoji').textContent = step.emoji;
  callout.querySelector('h3').textContent = step.title;
  callout.querySelector('p').textContent = step.body;

  const dots = callout.querySelector('.tour-callout-dots');
  dots.innerHTML = '';
  STEPS.forEach((_, i) => {
    const dot = document.createElement('span');
    dot.className = 'tour-callout-dot' + (i === currentStep ? ' active' : '');
    dots.appendChild(dot);
  });

  const nextBtn = callout.querySelector('.tour-next-btn');
  nextBtn.textContent = currentStep === STEPS.length - 1 ? 'בואו נתחיל! 🚀' : 'הבא ←';

  const needsDrawer = step.target && step.target.startsWith('#tab-') && isMobile();
  setDrawerOpen(Boolean(needsDrawer));

  const positionNow = () => {
    const targetEl = step.target ? document.querySelector(step.target) : null;
    positionForTarget(targetEl);
  };

  if (needsDrawer) {
    setTimeout(positionNow, 280);
  } else {
    positionNow();
  }
}

function advance() {
  if (currentStep < STEPS.length - 1) {
    currentStep++;
    renderStep();
    return;
  }
  finish();
}

async function finish() {
  setDrawerOpen(false);
  window.removeEventListener('resize', resizeHandler);
  blocker.remove();
  spotlight.remove();
  callout.remove();
  await setDoc(doc(db, 'profiles', auth.currentUser.uid), { tourCompletedAt: serverTimestamp() }, { merge: true });
}

export async function hasCompletedTour() {
  const snap = await getDoc(doc(db, 'profiles', auth.currentUser.uid));
  return Boolean(snap.exists() && snap.data().tourCompletedAt);
}

export function showWelcomeTour() {
  currentStep = 0;
  buildElements();
  renderStep();
  resizeHandler = () => renderStep();
  window.addEventListener('resize', resizeHandler);
}
