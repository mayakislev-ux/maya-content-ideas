import { db, auth } from './firebase-init.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const STEPS = [
  {
    emoji: '👋',
    title: 'ברוכות וברוכים הבאים!',
    body: '"המוח השיווקי שנמצא איתך 24/7" - בואו נכיר ב-30 שניות מה יש כאן ואיך להשתמש בזה נכון.',
  },
  {
    emoji: '📂',
    title: 'הרעיונות שלי',
    body: 'כאן שומרים ומנהלים את כל רעיונות התוכן שלכם - עם חיפוש, סינון וסימון "בוצע" ברגע שצילמתם. יש גם תיבת "הוספה מהירה" למעלה לרישום טיוטת רעיון תוך שנייה, ולהשלים אותה מאוחר יותר.',
  },
  {
    emoji: '🤖',
    title: 'בדיקת רעיון',
    body: 'צ\'אט עם AI שמדייק לכם רעיון לפי המתודולוגיה של מאיה, ומציע 5 זוויות הנגשה מתאימות.\n\n⚠️ חשוב מאוד: הצ\'אט מותאם ספציפית לתחום העסק אחד שהגדרתם בהיכרות הראשונה. אם תכתבו לו על תחום אחר לגמרי - הוא לא יוכל לעזור. שימו לב לכתוב רק על התחום שלכם.',
  },
  {
    emoji: '📖',
    title: 'איך למצוא רעיון',
    body: 'מדריך מלא של מאיה - 11 דרכים אמיתיות למצוא רעיונות לתוכן, גם כשנדמה שאין על מה לדבר.',
  },
  {
    emoji: '🗺️',
    title: 'מפת הדרכים ותכנית תוכן',
    body: 'שני כלים שעוזרים לקחת רעיון ולהפוך אותו לתוכן מוכן - מרעיון ועד פרסום, ותכנון קדימה.',
  },
  {
    emoji: '💜',
    title: 'זהו, בואו נתחיל!',
    body: 'יש גם לשונית "חוות דעת" - נשמח לשמוע מה עובד ומה פחות. בהצלחה!',
  },
];

let currentStep = 0;

function render() {
  const step = STEPS[currentStep];
  document.getElementById('welcome-tour-emoji').textContent = step.emoji;
  document.getElementById('welcome-tour-title').textContent = step.title;
  document.getElementById('welcome-tour-body').textContent = step.body;

  const dots = document.getElementById('welcome-tour-dots');
  dots.innerHTML = '';
  STEPS.forEach((_, i) => {
    const dot = document.createElement('span');
    dot.className = 'welcome-tour-dot' + (i === currentStep ? ' active' : '');
    dots.appendChild(dot);
  });

  const nextBtn = document.getElementById('welcome-tour-next-btn');
  nextBtn.textContent = currentStep === STEPS.length - 1 ? 'בואו נתחיל! 🚀' : 'הבא ←';
}

async function markTourCompleted() {
  await setDoc(doc(db, 'profiles', auth.currentUser.uid), { tourCompletedAt: serverTimestamp() }, { merge: true });
}

export async function hasCompletedTour() {
  const snap = await getDoc(doc(db, 'profiles', auth.currentUser.uid));
  return Boolean(snap.exists() && snap.data().tourCompletedAt);
}

export function showWelcomeTour(onComplete) {
  currentStep = 0;
  render();
  document.getElementById('welcome-tour').hidden = false;

  const nextBtn = document.getElementById('welcome-tour-next-btn');
  const handler = async () => {
    if (currentStep < STEPS.length - 1) {
      currentStep++;
      render();
      return;
    }
    nextBtn.removeEventListener('click', handler);
    document.getElementById('welcome-tour').hidden = true;
    await markTourCompleted();
    onComplete();
  };
  nextBtn.addEventListener('click', handler);
}
