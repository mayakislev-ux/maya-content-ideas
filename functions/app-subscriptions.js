/* 22/11/2026 (מאיה, לפני הטיסה לתאילנד): "תפתחי לי בפורטל ניהול לשונית שנקראת
   אפליקציה מנויים והכל יהיה מפורט לי שם. למי יש מנוי, למי הוראת קבע פעילה,
   ומשם אוכל לנהל את זה במקום לרשום לך, אם זה לפתוח מנוי אם זה לסגור מנוי".

   הכלל שלה מאותו יום: "כל הלקוחות זה הוראת קבע עד שאני אומרת לך לבטל".
   לכן מנוי קבוע הוא billing:'standing' בלי paidUntil, ונסגר רק בלחיצה שלה.
   שבוע ניסיון הוא billing:'trial' עם paidUntil, ונסגר לבד.

   מורנינג לא חושפים הוראות קבע ב-API (נבדק: כל הנתיבים מחזירים 404), ולכן
   לכל מנויה מוצג התשלום האחרון של 79 ש"ח שנמצא בקבלות, כראיה שהיא משלמת.

   הרשאה: רק אסימון של הפורטל עם role owner, כלומר מאיה. */

const OWNER_ROLE = 'owner';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_TRIAL_DAYS = 60;

const clean = (v) => String(v == null ? '' : v).trim();
const toDate = (v) => {
  if (!v) return null;
  const d = v.toDate ? v.toDate() : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** סוף היום בשעון ישראל, בעוד days ימים. */
function endOfIsraelDay(days, now = new Date()) {
  const ymd = new Date(now.getTime() + days * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  // 23:59 בישראל. בחורף זה UTC+2 ובקיץ UTC+3; Intl נותן את ההפרש של אותו יום.
  const probe = new Date(`${ymd}T12:00:00Z`);
  const il = new Date(probe.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const utc = new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMin = Math.round((il - utc) / 60000);
  return new Date(Date.parse(`${ymd}T23:59:00Z`) - offsetMin * 60000);
}

/** מצב המנוי כפי שמאיה צריכה לראות אותו. */
function statusOf(data, now = new Date()) {
  const until = toDate(data.paidUntil);
  if (until && until.getTime() <= now.getTime()) return 'closed';
  if (data.billing === 'trial') return 'trial';
  if (!until) return 'standing';
  return 'until'; // פתוח עד תאריך (חודש בודד ששולם, או חידוש ישן)
}

/** הקבלה האחרונה על 79 ש"ח לפי מייל או לפי שם. */
function lastPayment(receipts, { email, name, amount = 79 }) {
  const want = clean(email).toLowerCase();
  const wantName = clean(name).replace(/\s+/g, ' ');
  const hit = (receipts || [])
    .filter((d) => d && Number(d.status) !== 4 && Math.abs(Number(d.amount) - amount) < 0.01)
    .filter((d) => {
      const c = d.client || {};
      if ((c.emails || []).some((e) => clean(e).toLowerCase() === want)) return true;
      return wantName.length >= 4 && clean(c.name).replace(/\s+/g, ' ').includes(wantName);
    })
    .sort((a, b) => String(b.documentDate).localeCompare(String(a.documentDate)))[0];
  return hit ? { date: hit.documentDate, number: String(hit.number || '') } : null;
}

/** שורה אחת במסך. */
function rowOf(id, data, extra = {}, now = new Date()) {
  const until = toDate(data.paidUntil);
  return {
    email: id,
    name: clean(data.name),
    plan: data.plan === 'refs' ? 'refs' : 'full',
    status: statusOf(data, now),
    paidUntil: until ? until.toISOString() : null,
    createdAt: (toDate(data.createdAt) || null) && toDate(data.createdAt).toISOString(),
    closedAt: (toDate(data.closedAt) || null) && toDate(data.closedAt).toISOString(),
    lastPayment: extra.lastPayment || null,
    lastActiveAt: extra.lastActiveAt || null,
  };
}

/**
 * deps: {
 *   HttpsError, verifyPortalToken(t), now?(),
 *   listAllowlist() -> [{id, data}], getAllowlist(email) -> data|null, setAllowlist(email, patch, {deleteFields}),
 *   receipts() -> [...], lastActive(email) -> iso|null, enableUser(email, name) -> void,
 * }
 * data: { idToken, action: 'list'|'open'|'close', email?, name?, mode?: 'standing'|'trial', days? }
 */
function createAppSubscriptionsHandler(deps) {
  const { HttpsError } = deps;
  const now = () => (deps.now ? deps.now() : new Date());

  return async (request) => {
    const d = (request && request.data) || {};
    const idToken = typeof d.idToken === 'string' ? d.idToken : '';
    if (idToken.length < 100 || idToken.length > 5000) throw new HttpsError('invalid-argument', 'בקשה לא תקינה');
    let decoded;
    try {
      decoded = await deps.verifyPortalToken(idToken);
    } catch (err) {
      throw new HttpsError('unauthenticated', 'האימות מהפורטל נכשל');
    }
    if (!decoded || decoded.role !== OWNER_ROLE) throw new HttpsError('permission-denied', 'רק מאיה');

    const action = clean(d.action) || 'list';

    if (action === 'list') {
      const all = await deps.listAllowlist();
      let receipts = [];
      let paymentsOk = true;
      try { receipts = await deps.receipts(); } catch (err) { paymentsOk = false; console.error('appSubscriptions: morning', err.message); }
      const refs = all.filter((r) => (r.data || {}).plan === 'refs');
      const rows = await Promise.all(refs.map(async (r) => rowOf(r.id, r.data, {
        lastPayment: lastPayment(receipts, { email: r.data.billingEmail || r.id, name: r.data.name, amount: Number(r.data.monthlyPrice) || 79 }),
        lastActiveAt: await deps.lastActive(r.id).catch(() => null),
      }, now())));
      return { rows, fullCount: all.length - refs.length, paymentsOk };
    }

    const email = clean(d.email).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpsError('invalid-argument', 'מייל לא תקין');
    const existing = await deps.getAllowlist(email);
    /* לקוחת ליווי עם גישה מלאה לא יורדת לרפרנסים בלבד בטעות, ולא נסגרת מכאן */
    if (existing && existing.plan !== 'refs') {
      throw new HttpsError('failed-precondition', 'למייל הזה יש גישה מלאה כלקוחת ליווי. את זה לא משנים מכאן');
    }

    if (action === 'open') {
      const mode = d.mode === 'trial' ? 'trial' : 'standing';
      const name = clean(d.name).slice(0, 80) || clean(existing && existing.name);
      const patch = { plan: 'refs', name, updatedAt: now().toISOString(), openedBy: 'portal' };
      const deleteFields = ['closedAt'];
      if (!existing) patch.createdAt = now().toISOString();
      if (mode === 'trial') {
        const days = Math.round(Number(d.days));
        if (!Number.isFinite(days) || days < 1 || days > MAX_TRIAL_DAYS) {
          throw new HttpsError('invalid-argument', `מספר ימי ניסיון בין 1 ל-${MAX_TRIAL_DAYS}`);
        }
        Object.assign(patch, { billing: 'trial', paidUntil: endOfIsraelDay(days, now()), showCountdown: true, renewOffer: true, monthlyPrice: 79 });
        /* ניסיון שנפתח מחדש סופר מהיום, כדי שקבלה ישנה לא תהפוך אותו לקבוע */
        patch.createdAt = now().toISOString();
      } else {
        Object.assign(patch, { billing: 'standing', monthlyPrice: 79 });
        deleteFields.push('paidUntil', 'showCountdown', 'renewOffer');
      }
      await deps.setAllowlist(email, patch, { deleteFields });
      await deps.enableUser(email, name).catch((err) => console.error('appSubscriptions: enable', err.message));
      return { ok: true, row: rowOf(email, { ...(existing || {}), ...patch, paidUntil: patch.paidUntil || null }, {}, now()) };
    }

    if (action === 'close') {
      if (!existing) throw new HttpsError('not-found', 'אין מנוי למייל הזה');
      const at = now();
      const patch = { billing: 'cancelled', paidUntil: at, closedAt: at.toISOString(), updatedAt: at.toISOString() };
      await deps.setAllowlist(email, patch, { deleteFields: ['showCountdown', 'renewOffer'] });
      return { ok: true, row: rowOf(email, { ...existing, ...patch }, {}, new Date(at.getTime() + 1)) };
    }

    throw new HttpsError('invalid-argument', 'פעולה לא מוכרת');
  };
}

module.exports = { createAppSubscriptionsHandler, statusOf, lastPayment, endOfIsraelDay, rowOf };
