// 30/09/2026: החלק הטהור של טבלת החימום - מה מוצג, מה נכנס לתוכנית, וה-HTML
// עצמו.
//
// תיקון של מאיה באותו יום: "את לא צריכה לכתוב להם מה להגיד אלא רק נושאים".
// לכן אין כאן שדות שמבקשים מהן לכתוב תוכן. כלי שיש לו מקור בקובץ מציג את
// המילים שלהן משם, וכלי שאין לו מציג כותרת ונושא. את הכל אפשר לערוך.
//
// הוא יושב בקובץ נפרד ולא בתוך המסך כי המסך מייבא את Firebase מכתובת של
// gstatic, ואז אי אפשר לייבא אותו בטסט בלי דפדפן. כאן אין אף ייבוא, ולכן כל
// ההיגיון שבאמת יכול להישבר נבדק ישירות.

export function esc(text) {
  return String(text == null ? '' : text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/**
 * הטקסט של שורה אחת כפי שהוא מוצג וכפי שהוא נכנס לתוכנית.
 * סדר הקדימות: עריכה שלה, אחר כך תשובה שלה, אחר כך מה שנשלף מהגיליון.
 */
export function rowText(row, audienceId, { answers = {}, overrides = {} } = {}) {
  const override = ((overrides[audienceId] || {})[row.key] || '').trim();
  if (override) return override;
  const answer = ((answers[audienceId] || {})[row.key] || '').trim();
  if (answer) return answer;
  return (row.bullets || []).join('\n');
}

/** האם לשורה יש תוכן להציג: מהקובץ, או מה שהיא הוסיפה */
export function hasText(row, audienceId, saved) {
  return Boolean(rowText(row, audienceId, saved).trim());
}

export function selectedAudience(table, audienceId) {
  if (!table || !Array.isArray(table.audiences) || !table.audiences.length) return null;
  return table.audiences.find((a) => a.id === audienceId) || table.audiences[0];
}

/**
 * הספירה מתארת מאיפה התוכן בא, ולא מה היא חייבת.
 * withText = כמה כלים יש להם תוכן ממשי (מהקובץ או ממה שהיא הוסיפה).
 */
export function audienceCounts(audience, saved) {
  const rows = [...(audience.ongoing || []), ...(audience.sale || [])];
  const withText = rows.filter((r) => hasText(r, audience.id, saved)).length;
  return { total: rows.length, withText, topics: rows.length - withText };
}

export function countsLine(counts) {
  if (counts.withText === 0) return 'הכלים והנושאים שלך, מוכנים לעבודה';
  if (counts.withText === 1) return 'כלי אחד מלא במילים שלך מהקובץ';
  return `${counts.withText} כלים מלאים במילים שלך מהקובץ`;
}

/**
 * מה שנכנס לתוכנית.
 *
 * מאיה: "ואז גם הכל יהיה הרבה יותר מדויק כי זה ישלוף משם". שלושת השדות
 * שהפונקציה של התוכנית ממילא מקבלת (מוצר, קהל, הקשר) נבנים עכשיו מהטבלה
 * ולא מהקלדה מחדש, ולכן הפרומפט עצמו לא משתנה בכלל, רק מה שנכנס אליו.
 */
export function planInputs(audience, saved) {
  const line = (row) => {
    const parts = [];
    const text = rowText(row, audience.id, saved).trim();
    if (text) parts.push(text);
    if (row.topic) parts.push(row.topic);
    // רצף הסגירה נכנס לתוכנית כמו שמאיה לימדה אותו, ולא מנוסח מחדש
    if (Array.isArray(row.steps) && row.steps.length) parts.push(row.steps.join(' / '));
    return parts.length ? `${row.tool}: ${parts.join(' | ')}` : '';
  };
  const section = (title, rows) => [`=== ${title} ===`, ...rows.map(line).filter(Boolean)].join('\n');

  return {
    product: audience.buys || audience.name,
    audience: audience.name,
    extraContext: [
      section('חימום שוטף', audience.ongoing || []),
      section('חימום לקראת מכירה', audience.sale || []),
    ].join('\n\n'),
  };
}

function rowHtml(row, audience, saved) {
  const text = rowText(row, audience.id, saved);
  const stage = row.stage ? `<span class="st-stage">${row.stage}</span>` : '<span class="st-bar"></span>';

  const bullets = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<li>${esc(l)}</li>`)
    .join('');

  // רצף הסגירה. מאיה: "לימדתי אותן רצף של 4 סטוריז", ולכן הוא מוצג כרצף
  // ממוספר ולא כפסקה, בשמות שלה בדיוק.
  const steps = Array.isArray(row.steps) && row.steps.length
    ? `<ol class="st-steps">${row.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`
    : '';

  return `
    <li class="st-row${row.fromSheet ? '' : ' st-row--topic'}" data-key="${esc(row.key)}">
      <div class="st-row__head">${stage}<h3 class="st-row__tool">${esc(row.tool)}</h3></div>
      ${row.fromSheet ? `<span class="st-chip">${esc(row.source)}</span>` : ''}
      ${row.topic ? `<p class="st-topic">${esc(row.topic)}</p>` : ''}
      ${steps}
      ${bullets ? `<ul class="st-bullets">${bullets}</ul>` : ''}
      <button type="button" class="st-edit" data-row="${esc(row.key)}">לערוך או להוסיף</button>
      <label class="st-field" hidden>
        <span class="st-field__label">${esc(row.tool)}</span>
        <textarea class="st-input" rows="4" data-row="${esc(row.key)}" data-kind="override">${esc(text)}</textarea>
      </label>
    </li>`;
}

export function renderStoryTable(table, audienceId) {
  const audience = selectedAudience(table, audienceId);
  if (!audience) return '';
  const counts = audienceCounts(audience, table);

  const pills = table.audiences
    .map((a) => {
      const on = a.id === audience.id;
      return `<button type="button" class="st-pill${on ? ' is-on' : ''}" data-audience="${esc(a.id)}">
        ${esc(a.name)}
      </button>`;
    })
    .join('');

  const secondary = table.audiences.length - 1;

  return `
    <section class="st-gate">
      <p class="st-gate__lead">${esc(countsLine(counts))}</p>
      <p class="st-gate__sub">הכל נשלף מהקובץ האישי שלך. אפשר לערוך ולהוסיף לכל שורה, ואז לבנות תוכנית.</p>
      <button type="button" id="st-build-btn" class="btn-primary st-build">בניית תוכנית</button>
    </section>

    <div class="st-audiences">
      <span class="st-audiences__label">לאיזה קהל</span>
      <div class="st-pills">${pills}</div>
      <p class="st-audiences__note">${
        secondary > 0
          ? `קהל עיקרי. יש עוד ${secondary} קהלים בקובץ שלך, ולכל אחד תוכנית משלו.`
          : 'הקהל היחיד שמולא בקובץ שלך.'
      }</p>
    </div>

    <h2 class="st-section">חימום שוטף <span>5 כלים</span></h2>
    <ul class="st-list">${(audience.ongoing || []).map((r) => rowHtml(r, audience, table)).join('')}</ul>

    <h2 class="st-section">חימום לקראת מכירה <span>4 שלבים</span></h2>
    <ul class="st-list">${(audience.sale || []).map((r) => rowHtml(r, audience, table)).join('')}</ul>
  `;
}

/** בחירת הקהל לפני הבנייה */
export function planChoicesHtml(table, audienceId) {
  return (table.audiences || [])
    .map((a) => {
      const c = audienceCounts(a, table);
      const on = a.id === audienceId;
      return `<button type="button" class="st-choice${on ? ' is-on' : ''}" data-audience="${esc(a.id)}">
        <span class="st-choice__dot"></span>
        <span class="st-choice__text">
          <span class="st-choice__name">${esc(a.name)}</span>
          <span class="st-choice__meta">${a.primary ? 'קהל עיקרי' : 'קהל משני'} · ${c.withText} כלים מהקובץ שלך</span>
        </span>
      </button>`;
    })
    .join('');
}
