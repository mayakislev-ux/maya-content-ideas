/* ============================================================================
   השלמה חד-פעמית: סיווג כל הרעיונות שעוד לא סווגו (07/11/2026).

   מאיה ביקשה לסווג את כל הרעיונות של כל המשתמשים שאין להם סוג תוכן
   (category ריק או חסר, בערך 540). בנוי בדיוק כמו ההגירה של "בידורי"
   (recategorizeBiduri ב-index.js), בשלושה צעדים נפרדים:

   1. classifyUnsortedIdeas: דוח בלבד, לא כותב כלום. מנה של עד 150, עם
      סמן (afterId) כדי שרעיון שהסיווג שלו נכשל לא יתקע את המנה הבאה.
   2. applyClassifyUnsorted: כותב רק את ההחלטות מהדוח, בלי לסווג מחדש.
      כל רעיון נקרא שוב לפני הכתיבה, ואם בינתיים קיבל סוג הוא מדולג.
   3. undoClassifyUnsorted: מחזיר אחורה רק שדות שעוד נמצאים במצב שההשלמה
      השאירה אותם בו. בחירה מאוחרת של המשתמש/ת גוברת.

   המסווג הוא אותו מסווג של classifyIdea (classify-idea.js), עם temperature
   אפס. הוא מקבל רק את הכותרת, בדיוק כמו שהטופס באפליקציה שולח אותה
   (autoClassify ב-js/idea-form.js), כדי שהתוצאה תהיה זהה למה שהאפליקציה
   הייתה נותנת לרעיון הזה.

   ממלאים רק שדות ריקים: אם למשתמש/ת כבר יש שלב שכנוע או קהל, הם לא נדרסים.
   ============================================================================ */
const { CATEGORIES, PERSUASION_STAGES } = require('./ideas-constants');
const { AUDIENCE_SCOPES } = require('./classify-idea');

const BACKFILL_TAG = 'backfill-2026-11-07';
const UNSORTED_BATCH = 150;
const FIELDS = ['category', 'persuasionStage', 'audienceScope'];
const ALLOWED = { category: CATEGORIES, persuasionStage: PERSUASION_STAGES, audienceScope: AUDIENCE_SCOPES };

function isEmpty(value) {
  return value === undefined || value === null || (typeof value === 'string' && !value.trim());
}

/** רעיון חי שעוד אין לו סוג תוכן */
function isUnsorted(idea) {
  return Boolean(idea) && !idea.deletedAt && isEmpty(idea.category);
}

/** מה בדיוק ימולא: הסוג תמיד, השלב והקהל רק כשהם ריקים ברעיון */
function fillFor(idea, classified) {
  const fill = {};
  for (const key of FIELDS) {
    const value = classified && classified[key];
    if (isEmpty(idea[key]) && ALLOWED[key].includes(value)) fill[key] = value;
  }
  return fill;
}

/**
 * deps: HttpsError, db, FieldValue, isOwner(request) -> bool,
 *   classify(title) -> Promise<{ category, persuasionStage, audienceScope } | null>
 */
function createClassifyUnsortedHandlers(deps) {
  const { HttpsError, db, FieldValue } = deps;

  function assertOwner(request) {
    if (!request.auth || !deps.isOwner(request)) {
      throw new HttpsError('permission-denied', 'התכונה הזו זמינה למאיה בלבד');
    }
  }

  async function liveUnsorted() {
    const snap = await db.collection('ideas').get();
    return snap.docs
      .filter((doc) => isUnsorted(doc.data() || {}))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  async function report(request) {
    assertOwner(request);
    const data = request.data || {};
    const asked = Number(data.limit || UNSORTED_BATCH);
    const limit = Number.isFinite(asked) ? Math.min(Math.max(Math.trunc(asked), 1), UNSORTED_BATCH) : UNSORTED_BATCH;
    const afterId = typeof data.afterId === 'string' ? data.afterId : '';

    const live = await liveUnsorted();
    const pending = afterId ? live.filter((doc) => doc.id > afterId) : live;
    const docs = pending.slice(0, limit);
    const out = [];
    let failed = 0;

    for (const doc of docs) {
      const idea = doc.data() || {};
      const title = String(idea.title || '').slice(0, 2000);
      const base = { id: doc.id, ownerUid: idea.ownerUid || null, title: title || '(בלי כותרת)' };
      if (!title.trim()) {
        out.push({ ...base, to: null, fill: null, note: 'אין כותרת לסווג לפיה' });
        failed += 1;
        continue;
      }
      let classified = null;
      try {
        classified = await deps.classify(title);
      } catch (err) {
        console.error('classifyUnsortedIdeas: classify failed', doc.id, err && err.message);
      }
      const fill = fillFor(idea, classified);
      if (!fill.category) {
        out.push({ ...base, to: null, fill: null, note: 'הסיווג נכשל, נשאר בלי סוג' });
        failed += 1;
        continue;
      }
      out.push({ ...base, to: fill.category, fill, note: 'מוצע' });
    }

    const byCategory = {};
    out.forEach((r) => { if (r.to) byCategory[r.to] = (byCategory[r.to] || 0) + 1; });
    const more = pending.length > docs.length;
    const nextAfterId = more && docs.length ? docs[docs.length - 1].id : null;
    console.log('classifyUnsortedIdeas report', JSON.stringify({ found: live.length, pending: pending.length, handled: docs.length, failed, byCategory, nextAfterId }));
    return {
      found: live.length,
      pending: pending.length,
      handled: docs.length,
      failed,
      byCategory,
      nextAfterId,
      report: out,
      /* בדיוק מה שמעבירים ל-applyClassifyUnsorted אחרי שמאיה אישרה */
      decisions: out.filter((r) => r.fill).map((r) => ({ id: r.id, ...r.fill })),
    };
  }

  async function apply(request) {
    assertOwner(request);
    const decisions = (request.data && request.data.decisions) || [];
    if (!Array.isArray(decisions) || decisions.length === 0) {
      throw new HttpsError('invalid-argument', 'אין מה להחיל. צריך קודם להציג דוח ולאשר אותו.');
    }
    if (decisions.length > UNSORTED_BATCH) {
      throw new HttpsError('invalid-argument', `אפשר להחיל עד ${UNSORTED_BATCH} רעיונות בפעם אחת.`);
    }

    const out = [];
    let changed = 0;
    let skipped = 0;

    for (const decision of decisions) {
      const id = decision && typeof decision.id === 'string' ? decision.id : null;
      if (!id || !CATEGORIES.includes(decision.category)) {
        skipped += 1;
        out.push({ id: id || '(בלי מזהה)', to: null, note: 'החלטה לא תקינה, דולגה' });
        continue;
      }
      const ref = db.collection('ideas').doc(id);
      try {
        const doc = await ref.get();
        const idea = doc.exists ? (doc.data() || {}) : null;
        if (!idea) {
          skipped += 1;
          out.push({ id, to: null, note: 'הרעיון לא קיים יותר' });
          continue;
        }
        if (idea.deletedAt) {
          skipped += 1;
          out.push({ id, to: null, note: 'הרעיון נמחק, לא נגענו' });
          continue;
        }
        if (!isEmpty(idea.category)) {
          skipped += 1;
          out.push({ id, to: null, note: 'בינתיים קיבל סוג, לא נגענו' });
          continue;
        }
        /* רק שדות שעדיין ריקים עכשיו, ורק ערכים מהרשימות הסגורות */
        const fill = fillFor(idea, decision);
        const before = {};
        /* שדה שלא היה קיים לא נכנס לכאן, וההחזרה מוחקת אותו */
        for (const key of Object.keys(fill)) if (key in idea) before[key] = idea[key];
        await ref.update({
          ...fill,
          classifiedBy: BACKFILL_TAG,
          /* מה ההשלמה כתבה ומה היה שם קודם: ההחזרה אחורה נוגעת רק בשדה
             שעוד מכיל את מה שנכתב כאן */
          backfillFilled: fill,
          backfillBefore: before,
          backfilledAt: FieldValue.serverTimestamp(),
        });
        changed += 1;
        out.push({ id, to: fill.category, fill, note: 'סווג' });
      } catch (err) {
        console.error('applyClassifyUnsorted: write failed', id, err && err.message);
        skipped += 1;
        out.push({ id, to: null, note: 'הכתיבה נכשלה' });
      }
    }

    const remaining = (await liveUnsorted()).length;
    const byCategory = {};
    out.forEach((r) => { if (r.to) byCategory[r.to] = (byCategory[r.to] || 0) + 1; });
    console.log('applyClassifyUnsorted', JSON.stringify({ changed, skipped, remaining, byCategory }));
    return { changed, skipped, remaining, byCategory, report: out };
  }

  async function undo(request) {
    assertOwner(request);
    const snap = await db.collection('ideas').where('classifiedBy', '==', BACKFILL_TAG).get();
    let restored = 0;
    let kept = 0;
    for (const doc of snap.docs) {
      const idea = doc.data() || {};
      const filled = idea.backfillFilled || {};
      const before = idea.backfillBefore || {};
      const update = {
        classifiedBy: FieldValue.delete(),
        backfillFilled: FieldValue.delete(),
        backfillBefore: FieldValue.delete(),
        backfilledAt: FieldValue.delete(),
      };
      let touched = false;
      for (const key of FIELDS) {
        if (!(key in filled)) continue;
        if (idea[key] !== filled[key]) {
          /* המשתמש/ת שינו את השדה אחרי ההשלמה: הבחירה שלהם נשארת */
          kept += 1;
          continue;
        }
        update[key] = key in before ? before[key] : FieldValue.delete();
        touched = true;
      }
      await doc.ref.update(update);
      if (touched) restored += 1;
    }
    console.log('undoClassifyUnsorted', JSON.stringify({ restored, kept }));
    return { restored, kept };
  }

  return { report, apply, undo };
}

module.exports = {
  BACKFILL_TAG,
  UNSORTED_BATCH,
  isUnsorted,
  fillFor,
  createClassifyUnsortedHandlers,
};
