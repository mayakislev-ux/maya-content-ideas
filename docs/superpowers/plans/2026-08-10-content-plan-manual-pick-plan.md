# בחירת רעיונות ספציפיים לתכנית תוכן - תכנית ביצוע

> **לסוכנים אוטונומיים:** תת-סקיל נדרש: `superpowers:subagent-driven-development` (מומלץ) או `superpowers:executing-plans` לביצוע התכנית הזו משימה-אחר-משימה. השלבים משתמשים בתחביר checkbox (`- [ ]`) למעקב.

**מטרה:** לאפשר למאיה לסמן רעיונות ספציפיים בפופאפ לפני בניית תכנית תוכן, כך שהם מקבלים עדיפות ראשונה בתוך מכסת הקטגוריה שלהם - בלי לתת ל-AI שיקול דעת חדש על מי נכנס.

**ארכיטקטורה:** שינוי client-side בלבד ב-`js/content-plan.js`/`index.html`/`css/style.css`. `selectIdeasForRatio` (שכבר בוחרת דטרמיניסטית מי נשלח ל-AI) מקבלת פרמטר שלישי `pinnedIds` ומחזירה גם רשימת רעיונות מסומנים שנשמטו; שום קריאה לפונקציית ענן לא משתנה.

**מחסנית טכנולוגית:** Vanilla JS (ES modules, בלי build step), Firebase Firestore/Functions (לא נוגעים בפונקציות בתכנית הזו), GitHub Pages (פריסה = `git push` בלבד).

**מבנה קבצים:** אין קבצים חדשים. שלושה קבצים קיימים משתנים:
- `js/content-plan.js` - הלוגיקה (בחירת רעיונות, wiring הכפתור/מודל, סקורקארד).
- `index.html` - כפתור חדש + מודל בחירה חדש.
- `css/style.css` - עיצוב מינימלי למודל הבחירה.

---

### Task 1: `selectIdeasForRatio` תומכת בבחירה ידנית ומדווחת מה נשמט

**קבצים:**
- שנה: `js/content-plan.js` (הפונקציה `selectIdeasForRatio`, כרגע סביב שורה 52-84)

- [ ] **שלב 1: להחליף את `selectIdeasForRatio` בגרסה החדשה**

מצאי את הפונקציה הקיימת:

```js
function selectIdeasForRatio(readyIdeasSortedByRating, pieceCount) {
  const byCategory = {};
  for (const idea of readyIdeasSortedByRating) {
    (byCategory[idea.category] = byCategory[idea.category] || []).push(idea);
  }
  // שיטת "השארית הגדולה" - עיגול כל קטגוריה בנפרד (Math.round) לא בהכרח
  // מסתכם בחזרה ל-pieceCount (נמצא באמת: 16 - ברירת המחדל עצמה! - יצא
  // 15 בפועל). מחשבים קודם את המכסה המדויקת (לא מעוגלת) לכל קטגוריה,
  // לוקחים את השלם התחתון של כולן, ואז מחלקים את מה שנשאר (עד להשלמת
  // pieceCount) לפי מי שהכי קרוב לעיגול למעלה - כך שהסכום תמיד יוצא
  // בדיוק pieceCount (כשיש מספיק היצע בכל קטגוריה).
  const entries = Object.entries(CATEGORY_TARGETS).map(([cat, target]) => {
    const exact = pieceCount * target;
    return { cat, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = pieceCount - entries.reduce((sum, e) => sum + e.count, 0);
  [...entries]
    .sort((a, b) => b.remainder - a.remainder)
    .forEach((e) => {
      if (remaining > 0) {
        e.count += 1;
        remaining -= 1;
      }
    });

  const selected = [];
  for (const e of entries) {
    const pool = byCategory[e.cat] || [];
    const targetCount = Math.max(1, e.count);
    selected.push(...pool.slice(0, targetCount));
  }
  return selected.sort((a, b) => ratingRank(a.rating) - ratingRank(b.rating));
}
```

והחליפי אותה בדיוק בזו (שינוי יחיד: לולאת המילוי בסוף מפצלת כל קטגוריה למסומן/לא-מסומן, וחתימת/החזרת הפונקציה משתנה מ-array בודד לאובייקט עם שני שדות):

```js
function selectIdeasForRatio(readyIdeasSortedByRating, pieceCount, pinnedIds = new Set()) {
  const byCategory = {};
  for (const idea of readyIdeasSortedByRating) {
    (byCategory[idea.category] = byCategory[idea.category] || []).push(idea);
  }
  // שיטת "השארית הגדולה" - עיגול כל קטגוריה בנפרד (Math.round) לא בהכרח
  // מסתכם בחזרה ל-pieceCount (נמצא באמת: 16 - ברירת המחדל עצמה! - יצא
  // 15 בפועל). מחשבים קודם את המכסה המדויקת (לא מעוגלת) לכל קטגוריה,
  // לוקחים את השלם התחתון של כולן, ואז מחלקים את מה שנשאר (עד להשלמת
  // pieceCount) לפי מי שהכי קרוב לעיגול למעלה - כך שהסכום תמיד יוצא
  // בדיוק pieceCount (כשיש מספיק היצע בכל קטגוריה).
  const entries = Object.entries(CATEGORY_TARGETS).map(([cat, target]) => {
    const exact = pieceCount * target;
    return { cat, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = pieceCount - entries.reduce((sum, e) => sum + e.count, 0);
  [...entries]
    .sort((a, b) => b.remainder - a.remainder)
    .forEach((e) => {
      if (remaining > 0) {
        e.count += 1;
        remaining -= 1;
      }
    });

  const selected = [];
  const droppedPinned = [];
  for (const e of entries) {
    const pool = byCategory[e.cat] || [];
    const targetCount = Math.max(1, e.count);
    // רעיונות מסומנים (pinnedIds) מקבלים עדיפות ראשונה למכסה של הקטגוריה
    // שלהם, לפי דירוג ביניהם - ורק מה שנשאר מהמכסה מתמלא מהלא-מסומנים,
    // בדיוק כמו הבחירה האוטומטית הרגילה. pool כבר ממוין לפי דירוג (מגיע
    // מ-readyIdeasSortedByRating), אז filter שומר על סדר הדירוג בכל
    // תת-קבוצה בלי צורך למיין שוב.
    const pinnedInCategory = pool.filter((idea) => pinnedIds.has(idea.id));
    const unpinnedInCategory = pool.filter((idea) => !pinnedIds.has(idea.id));
    const chosenPinned = pinnedInCategory.slice(0, targetCount);
    droppedPinned.push(...pinnedInCategory.slice(targetCount));
    const remainingSlots = targetCount - chosenPinned.length;
    selected.push(...chosenPinned, ...unpinnedInCategory.slice(0, remainingSlots));
  }
  return {
    selected: selected.sort((a, b) => ratingRank(a.rating) - ratingRank(b.rating)),
    droppedPinned,
  };
}
```

- [ ] **שלב 2: לבדוק תחביר**

הרצה: `cd "מיקום-הריפו" && node --experimental-vm-modules -e "const fs=require('fs'); new (require('vm').SourceTextModule)(fs.readFileSync('js/content-plan.js','utf8')); console.log('SYNTAX_OK')" 2>&1 | grep -v Warning`

תוצאה צפויה: `SYNTAX_OK`

(הערה: `node --check` הרגיל נכשל על קבצי ES module האלה כי אין `package.json` עם `"type":"module"` - זה תמיד נראה כמו שגיאת תחביר על ה-`export` הראשון, גם כשהקוד תקין. `vm.SourceTextModule` הוא הדרך הנכונה לבדוק תחביר בפרויקט הזה.)

- [ ] **שלב 3: קומיט**

```bash
git add js/content-plan.js
git commit -m "content-plan: selectIdeasForRatio supports pinned ideas and reports drops"
```

---

### Task 2: כפתור + מודל בחירה חדש ב-index.html

**קבצים:**
- שנה: `index.html` (טופס `content-plan-form`, סביב שורה 603-613; ומיד אחרי `audience-edit-modal`, שנסגר סביב שורה 648-649)

- [ ] **שלב 1: להוסיף כפתור בטופס, לפני כפתור השליחה**

מצאי בתוך `<form id="content-plan-form" ...>`:

```html
      <p id="content-plan-error" class="error-text" role="alert" hidden></p>
      <button type="submit" class="btn-primary" id="content-plan-generate-btn">📅 בניית תכנית תוכן</button>
```

והחליפי בזה (מוסיפה שורה אחת לפני):

```html
      <button type="button" id="content-plan-pick-ideas-btn" class="btn-text">🎯 בחירת רעיונות ספציפיים (אופציונלי)</button>
      <p id="content-plan-error" class="error-text" role="alert" hidden></p>
      <button type="submit" class="btn-primary" id="content-plan-generate-btn">📅 בניית תכנית תוכן</button>
```

- [ ] **שלב 2: להוסיף מודל בחירה חדש, מיד אחרי סגירת `audience-edit-modal`**

מצאי:

```html
</div>
```

(סגירת ה-div של `audience-edit-modal`, השורה שאחרי `</form>` שלו) והוסיפי מיד אחריה:

```html

<!-- רשימת ה-checkbox נבנית דינמית ב-JS (content-plan.js, renderPickIdeasList) -
     ה-div כאן הוא רק המיכל הריק. -->
<div id="content-plan-pick-ideas-modal" class="modal" hidden role="dialog" aria-modal="true" aria-labelledby="content-plan-pick-ideas-title">
  <div class="modal-content modal-content-wide">
    <button type="button" id="content-plan-pick-ideas-close-btn" class="modal-close-x" aria-label="סגירה">✕</button>
    <h2 id="content-plan-pick-ideas-title">בחירת רעיונות ספציפיים</h2>
    <p class="content-plan-pick-ideas-hint">רעיונות שתסמני יקבלו עדיפות ראשונה בתוך הקטגוריה שלהם - אבל אם תסמני יותר ממה שיש מקום, רק המדורגים הכי גבוה מהסימון ייכנסו בפועל.</p>
    <div id="content-plan-pick-ideas-list" class="content-plan-pick-ideas-list"></div>
    <div class="modal-actions">
      <button type="button" id="content-plan-pick-ideas-cancel-btn" class="btn-text">ביטול</button>
      <button type="button" id="content-plan-pick-ideas-save-btn" class="btn-primary">שמירת בחירה</button>
    </div>
  </div>
</div>
```

- [ ] **שלב 3: לוודא איזון תגיות**

הרצה:
```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
['div','form','button','label','p','h2'].forEach((tag) => {
  const open = (html.match(new RegExp('<' + tag + '[ >]', 'g')) || []).length;
  const close = (html.match(new RegExp('</' + tag + '>', 'g')) || []).length;
  console.log(tag, 'open:', open, 'close:', close, open === close ? 'OK' : 'MISMATCH');
});
"
```

תוצאה צפויה: `OK` לכל התגיות (מספרים גבוהים בגלל שאר הדף - חשוב שהם *שווים*, לא שהם קטנים).

- [ ] **שלב 4: קומיט**

```bash
git add index.html
git commit -m "content-plan: add manual idea-picker button and modal markup"
```

---

### Task 3: Wiring - הכפתור, המודל, ה-state, וה-submit handler

**קבצים:**
- שנה: `js/content-plan.js` (בתוך `wireContentPlanView()`, כרגע שורה 751-944)

- [ ] **שלב 1: להוסיף state + פונקציית רינדור לרשימת הבחירה**

מצאי בתחילת `wireContentPlanView()`:

```js
export function wireContentPlanView() {
  const form = document.getElementById('content-plan-form');
  const errorEl = document.getElementById('content-plan-error');
  const loadingEl = document.getElementById('content-plan-loading');
  const generateBtn = document.getElementById('content-plan-generate-btn');
  const saveBtn = document.getElementById('content-plan-save-btn');
  const saveBtnTop = document.getElementById('content-plan-save-btn-top');
  const savedToggleBtn = document.getElementById('content-plan-saved-toggle-btn');
  const savedListEl = document.getElementById('content-plan-saved-list');
  const scorecardEl = document.getElementById('content-plan-scorecard');

  const modal = document.getElementById('content-plan-modal');
  const audienceModal = document.getElementById('audience-edit-modal');
  const secondaryAudienceRow = document.getElementById('content-plan-secondary-audience-row');
  const includeSecondaryCheckbox = document.getElementById('content-plan-include-secondary');
```

והחליפי בזה (מוסיפה בלוק חדש בסוף):

```js
export function wireContentPlanView() {
  const form = document.getElementById('content-plan-form');
  const errorEl = document.getElementById('content-plan-error');
  const loadingEl = document.getElementById('content-plan-loading');
  const generateBtn = document.getElementById('content-plan-generate-btn');
  const saveBtn = document.getElementById('content-plan-save-btn');
  const saveBtnTop = document.getElementById('content-plan-save-btn-top');
  const savedToggleBtn = document.getElementById('content-plan-saved-toggle-btn');
  const savedListEl = document.getElementById('content-plan-saved-list');
  const scorecardEl = document.getElementById('content-plan-scorecard');

  const modal = document.getElementById('content-plan-modal');
  const audienceModal = document.getElementById('audience-edit-modal');
  const secondaryAudienceRow = document.getElementById('content-plan-secondary-audience-row');
  const includeSecondaryCheckbox = document.getElementById('content-plan-include-secondary');

  const pickIdeasModal = document.getElementById('content-plan-pick-ideas-modal');
  const pickIdeasBtn = document.getElementById('content-plan-pick-ideas-btn');
  const pickIdeasList = document.getElementById('content-plan-pick-ideas-list');
  // נשמר רק בזיכרון, לא ב-Firestore - מתאפס בכל פתיחה מחדש של מודל
  // "בניית תכנית תוכן" (ראו open-builder-btn למטה).
  let pinnedIdeaIds = new Set();

  function renderPickIdeasList() {
    pickIdeasList.innerHTML = '';
    const readyIdeas = [...getReadyIdeas()].sort((a, b) => ratingRank(a.rating) - ratingRank(b.rating));
    const byCategory = {};
    for (const idea of readyIdeas) {
      (byCategory[idea.category] = byCategory[idea.category] || []).push(idea);
    }
    for (const category of CATEGORIES) {
      const ideas = byCategory[category] || [];
      if (!ideas.length) continue;
      const heading = document.createElement('div');
      heading.className = 'content-plan-pick-ideas-heading';
      heading.style.setProperty('--card-color', categoryColorVar(category));
      heading.textContent = `${categoryIcon(category)} ${category}`;
      pickIdeasList.appendChild(heading);
      for (const idea of ideas) {
        const label = document.createElement('label');
        label.className = 'content-plan-pick-idea-row';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = pinnedIdeaIds.has(idea.id);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) pinnedIdeaIds.add(idea.id);
          else pinnedIdeaIds.delete(idea.id);
        });
        label.appendChild(checkbox);
        const title = document.createElement('span');
        title.textContent = idea.title;
        label.appendChild(title);
        pickIdeasList.appendChild(label);
      }
    }
  }
```

- [ ] **שלב 2: לחבר את הכפתור/מודל הבחירה**

מצאי:

```js
  document.getElementById('content-plan-open-builder-btn').addEventListener('click', async () => {
    refreshGate();
    modal.hidden = false;
    await refreshAudienceGate();
  });
```

והחליפי בזה:

```js
  document.getElementById('content-plan-open-builder-btn').addEventListener('click', async () => {
    pinnedIdeaIds = new Set();
    refreshGate();
    modal.hidden = false;
    await refreshAudienceGate();
  });

  pickIdeasBtn.addEventListener('click', () => {
    renderPickIdeasList();
    pickIdeasModal.hidden = false;
  });

  function closePickIdeasModal() {
    pickIdeasModal.hidden = true;
  }
  document.getElementById('content-plan-pick-ideas-close-btn').addEventListener('click', closePickIdeasModal);
  document.getElementById('content-plan-pick-ideas-cancel-btn').addEventListener('click', closePickIdeasModal);
  document.getElementById('content-plan-pick-ideas-save-btn').addEventListener('click', closePickIdeasModal);
  pickIdeasModal.addEventListener('click', (e) => {
    if (e.target === pickIdeasModal) closePickIdeasModal();
  });
```

- [ ] **שלב 3: לעדכן את ה-submit handler להשתמש בחתימה החדשה של `selectIdeasForRatio`**

מצאי:

```js
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const pieceCount = Number(document.getElementById('content-plan-piece-count').value) || MIN_PIECE_COUNT;
    const readyIdeas = [...getReadyIdeas()].sort((a, b) => ratingRank(a.rating) - ratingRank(b.rating));
    const cappedIdeas = selectIdeasForRatio(readyIdeas, pieceCount).slice(0, MAX_IDEAS_SENT);
```

והחליפי בזה:

```js
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const pieceCount = Number(document.getElementById('content-plan-piece-count').value) || MIN_PIECE_COUNT;
    const readyIdeas = [...getReadyIdeas()].sort((a, b) => ratingRank(a.rating) - ratingRank(b.rating));
    const { selected, droppedPinned } = selectIdeasForRatio(readyIdeas, pieceCount, pinnedIdeaIds);
    const cappedIdeas = selected.slice(0, MAX_IDEAS_SENT);
```

עכשיו מצאי (בהמשך אותו handler, אחרי הקריאה המוצלחת ל-`generateContentPlan`):

```js
      const result = await generateContentPlan({ pieceCount, ideas: ideasPayload, includeSecondaryAudience });
      currentPlan = enrichPlanFromBank(result.data.plan, cappedIdeas);
      if (readyIdeas.length > cappedIdeas.length) {
        currentPlan.truncatedFrom = readyIdeas.length;
        currentPlan.selectedCount = cappedIdeas.length;
      }
      currentMeta = { pieceCount };
```

והחליפי בזה (מוסיפה בלוק `droppedPinned` באמצע):

```js
      const result = await generateContentPlan({ pieceCount, ideas: ideasPayload, includeSecondaryAudience });
      currentPlan = enrichPlanFromBank(result.data.plan, cappedIdeas);
      if (readyIdeas.length > cappedIdeas.length) {
        currentPlan.truncatedFrom = readyIdeas.length;
        currentPlan.selectedCount = cappedIdeas.length;
      }
      if (droppedPinned.length) {
        currentPlan.droppedPinnedTitles = droppedPinned.map((idea) => idea.title);
      }
      currentMeta = { pieceCount };
```

- [ ] **שלב 4: לבדוק תחביר**

הרצה: `node --experimental-vm-modules -e "const fs=require('fs'); new (require('vm').SourceTextModule)(fs.readFileSync('js/content-plan.js','utf8')); console.log('SYNTAX_OK')" 2>&1 | grep -v Warning`

תוצאה צפויה: `SYNTAX_OK`

- [ ] **שלב 5: קומיט**

```bash
git add js/content-plan.js
git commit -m "content-plan: wire manual idea-picker button/modal and pass pinned ideas to selection"
```

---

### Task 4: שורת הודעה חדשה בסקורקארד לרעיונות שנשמטו

**קבצים:**
- שנה: `js/content-plan.js` (הפונקציה `renderScorecard`, כרגע סביב שורה 246-295)

- [ ] **שלב 1: להוסיף בלוק חדש אחרי בדיקת `plan.truncatedFrom`**

מצאי:

```js
  if (plan.truncatedFrom) {
    notes.push({
      icon: '✂️',
      text: `התכנית נבנתה מתוך ${plan.selectedCount || plan.truncatedFrom} רעיונות שנבחרו לפי יחס הקטגוריות, מתוך ${plan.truncatedFrom} שיש לך במאגר - לא כל הרעיונות נכנסו כדי לשמור על האיזון`,
    });
  }
  if (notes.length) {
```

והחליפי בזה:

```js
  if (plan.truncatedFrom) {
    notes.push({
      icon: '✂️',
      text: `התכנית נבנתה מתוך ${plan.selectedCount || plan.truncatedFrom} רעיונות שנבחרו לפי יחס הקטגוריות, מתוך ${plan.truncatedFrom} שיש לך במאגר - לא כל הרעיונות נכנסו כדי לשמור על האיזון`,
    });
  }
  if (plan.droppedPinnedTitles && plan.droppedPinnedTitles.length) {
    const titles = plan.droppedPinnedTitles.join(', ');
    const text =
      plan.droppedPinnedTitles.length === 1
        ? `הרעיון שסימנת ידנית "${titles}" לא נכנס לתכנית כי חרג ממכסת הקטגוריה שלו`
        : `${plan.droppedPinnedTitles.length} מהרעיונות שסימנת ידנית לא נכנסו לתכנית כי חרגו ממכסת הקטגוריה שלהם: ${titles}`;
    notes.push({ icon: '📌', text });
  }
  if (notes.length) {
```

- [ ] **שלב 2: לבדוק תחביר**

הרצה: `node --experimental-vm-modules -e "const fs=require('fs'); new (require('vm').SourceTextModule)(fs.readFileSync('js/content-plan.js','utf8')); console.log('SYNTAX_OK')" 2>&1 | grep -v Warning`

תוצאה צפויה: `SYNTAX_OK`

- [ ] **שלב 3: קומיט**

```bash
git add js/content-plan.js
git commit -m "content-plan: report dropped pinned ideas in the scorecard"
```

---

### Task 5: עיצוב CSS מינימלי למודל הבחירה

**קבצים:**
- שנה: `css/style.css` (הוספה בסוף הקובץ)

- [ ] **שלב 1: להוסיף בלוק CSS חדש בסוף `css/style.css`**

```css

.content-plan-pick-ideas-hint {
  color: var(--muted);
  font-size: 0.9rem;
  margin-bottom: 0.8rem;
}

.content-plan-pick-ideas-list {
  max-height: 50vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.content-plan-pick-ideas-heading {
  font-weight: bold;
  border-inline-start: 4px solid var(--card-color, var(--accent));
  padding-inline-start: 0.6rem;
  margin-top: 0.8rem;
}

.content-plan-pick-idea-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.6rem;
  border-radius: 8px;
  cursor: pointer;
}

.content-plan-pick-idea-row:hover {
  background: var(--surface);
}
```

- [ ] **שלב 2: לוודא איזון סוגריים**

הרצה:
```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('css/style.css', 'utf8');
const open = (content.match(/\{/g) || []).length;
const close = (content.match(/\}/g) || []).length;
console.log('open', open, 'close', close, open === close ? 'OK' : 'MISMATCH');
"
```

תוצאה צפויה: `OK`

- [ ] **שלב 3: קומיט**

```bash
git add css/style.css
git commit -m "content-plan: style the manual idea-picker modal"
```

---

### Task 6: דחיפה ואימות שהפריסה חיה

**קבצים:** אין קבצים חדשים - זו רק הרצת פקודות.

- [ ] **שלב 1: לדחוף ל-master**

```bash
git push origin master
```

**חשוב: אין `firebase deploy` במשימה הזו** - שום קובץ ב-`functions/` לא נגע בתכנית הזו (עקרון הליבה מהעיצוב: הבחירה הידנית היא לוגיקת בחירה client-side בלבד, ה-AI לא מקבל שום הרשאה/הוראה חדשה). GitHub Pages בונה אוטומטית מ-`master`.

- [ ] **שלב 2: לאמת שהקבצים החיים כוללים את השינוי**

```bash
for i in 1 2 3 4 5; do
  n=$(curl -s "https://mayakislev-ux.github.io/maya-content-ideas/js/content-plan.js?cb=$RANDOM" | grep -c "pinnedIdeaIds")
  echo "attempt $i: $n"
  if [ "$n" -gt 0 ]; then break; fi
  sleep 15
done
```

תוצאה צפויה: `n` גדול מ-0 באחד הניסיונות (GitHub Pages לפעמים לוקח כמה עשרות שניות לפרסם).

---

## בדיקה ידנית (לא אוטומטית - מאיה צריכה לעשות בעצמה באפליקציה החיה)

אחרי שכל 6 המשימות הושלמו ואומתו, זה לא נגמר עד שמאיה בעצמה:
1. פותחת "בניית תכנית תוכן", לוחצת "🎯 בחירת רעיונות ספציפיים", מסמנת כמה רעיונות (כולל בכוונה יותר ממה שהמכסה של קטגוריה מסוימת מאפשרת), שומרת בחירה.
2. בונה תכנית ובודקת שהרעיונות שסימנה אכן נכנסו (עד למכסת הקטגוריה שלהם).
3. אם סימנה יותר ממכסה - בודקת שהסקורקארד מציג את השורה החדשה "📌 ... לא נכנסו לתכנית".
4. פותחת שוב את מודל "בניית תכנית תוכן" מחדש (סגירה ופתיחה) ומוודאת שהבחירה הקודמת התאפסה (התנהגות מכוונת, לא באג).
