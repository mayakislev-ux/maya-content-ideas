# אפליקציית ניהול רעיונות לתוכן - Implementation Plan

> **For agentic workers:** This plan is executed inline in the current session (no subagent dispatch — single small self-contained app, one developer/session is the efficient path). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working, deployed web app where Maya can track content ideas on a 4-column status board and search/filter a full archive, synced across her phone and computer via Firebase, hosted on GitHub Pages.

**Architecture:** Static HTML/CSS/JS (ES modules, no bundler/build step) using the Firebase JS SDK (v10, loaded from CDN) for Firestore (data) and Firebase Authentication (Google sign-in). Pure business logic (status transitions, filtering, validation) lives in a dependency-free module so it can be unit-tested with Node's built-in test runner; DOM/Firebase-wired code is verified manually in a real browser per the spec's own testing section.

**Tech Stack:** Vanilla JS (ES modules), Firebase JS SDK v10 (Firestore + Auth, CDN import, no npm install needed), Node.js `node:test`/`node:assert` for logic unit tests, GitHub Pages for hosting, `gh` CLI for repo/pages setup.

---

## File Structure

```
אפליקציית ניהול רעיונות/
├── index.html                 # single page: login gate, board view, archive view, add/edit modal
├── css/
│   └── style.css              # all styling — dark bold color-coded theme
├── js/
│   ├── firebase-init.js       # Firebase app/auth/db init, exports {app, auth, db}
│   ├── ideas-logic.js         # pure functions: categories, statuses, nextStatus/prevStatus, filterIdeas, validateIdea
│   ├── ideas-store.js         # Firestore data layer: subscribeToIdeas, addIdea, updateIdea, deleteIdea
│   ├── auth.js                # signInWithGoogle, signOutUser, onAuthChange
│   ├── board-view.js          # renders the 4-column kanban board + cards
│   ├── archive-view.js        # renders the searchable/filterable list
│   ├── idea-form.js           # add/edit modal logic
│   └── app.js                 # bootstraps everything, view switching, wires auth gate
├── firestore.rules            # security rules: only the authenticated owner uid can read/write
├── firebase.json              # points at firestore.rules (for rule deploys only — hosting stays on GH Pages)
├── .firebaserc                # points at the Firebase project id
├── test/
│   └── ideas-logic.test.mjs   # node:test unit tests for js/ideas-logic.js
└── docs/superpowers/          # spec + this plan (already exists)
```

**Why this split:** `ideas-logic.js` has zero DOM/Firebase imports so it runs under plain Node for fast, real unit tests. `ideas-store.js` isolates every Firestore call so the view files never talk to Firestore directly — swapping storage later (if ever) touches one file. Each `*-view.js` owns rendering + event wiring for exactly one screen.

---

### Task 1: Firebase project setup

**Files:** none yet — this is account/console setup, produces the config values Task 3 needs.

- [ ] **Step 1: Confirm firebase-tools runs via npx (no global install)**

Run: `npx firebase-tools@13 --version`
Expected: prints a version number like `13.x.x` (first run downloads the package — takes ~10-20s).

- [ ] **Step 2: Log in with Maya's Google account**

Run: `npx firebase-tools@13 login`
This opens a browser window. Maya signs in with `mayakislev@gmail.com` and clicks "Allow".
Expected terminal output: `✔  Success! Logged in as mayakislev@gmail.com`

- [ ] **Step 3: Create the Firebase project**

Run: `npx firebase-tools@13 projects:create maya-content-ideas --display-name "רעיונות לתוכן"`
Expected: `✔ Created project maya-content-ideas`. If the ID is taken, retry with `maya-content-ideas-2026` (project IDs are globally unique).

- [ ] **Step 4: Enable Firestore (console — no CLI command creates a Native-mode database reliably)**

Guide Maya to open `https://console.firebase.google.com/project/maya-content-ideas/firestore`, click **"Create database"**, choose **"Start in production mode"**, pick region **`eur3` (Europe)**, click **"Enable"**.

- [ ] **Step 5: Enable Google sign-in (console)**

Guide Maya to open `https://console.firebase.google.com/project/maya-content-ideas/authentication/providers`, click **"Google"**, toggle **Enable**, set support email to her Gmail, click **"Save"**.

- [ ] **Step 6: Register a Web App and capture the config object**

Guide Maya to open `https://console.firebase.google.com/project/maya-content-ideas/settings/general`, scroll to "Your apps", click the **`</>`** (Web) icon, nickname it `content-ideas-web`, leave "Also set up Firebase Hosting" **unchecked** (we use GitHub Pages), click **"Register app"**. Copy the `firebaseConfig` object shown (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId) — needed verbatim in Task 3.

---

### Task 2: Pure logic module + unit tests (TDD)

**Files:**
- Create: `js/ideas-logic.js`
- Test: `test/ideas-logic.test.mjs`

- [ ] **Step 1: Write the failing tests**

```javascript
// test/ideas-logic.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES,
  STATUSES,
  nextStatus,
  prevStatus,
  filterIdeas,
  validateIdea,
} from '../js/ideas-logic.js';

test('CATEGORIES has the 4 expected values in order', () => {
  assert.deepEqual(CATEGORIES, ['ערכי', 'אישי', 'מכירתי', 'בידורי']);
});

test('STATUSES has the 4 expected stages in order', () => {
  assert.deepEqual(STATUSES, ['רעיון', 'מתוכנן', 'צולם/הוקלט', 'פורסם']);
});

test('nextStatus moves forward one stage', () => {
  assert.equal(nextStatus('רעיון'), 'מתוכנן');
  assert.equal(nextStatus('מתוכנן'), 'צולם/הוקלט');
  assert.equal(nextStatus('צולם/הוקלט'), 'פורסם');
});

test('nextStatus is a no-op at the last stage', () => {
  assert.equal(nextStatus('פורסם'), 'פורסם');
});

test('prevStatus moves backward one stage', () => {
  assert.equal(prevStatus('פורסם'), 'צולם/הוקלט');
  assert.equal(prevStatus('מתוכנן'), 'רעיון');
});

test('prevStatus is a no-op at the first stage', () => {
  assert.equal(prevStatus('רעיון'), 'רעיון');
});

test('filterIdeas matches free text in title or hookText', () => {
  const ideas = [
    { title: 'טעות נפוצה', hookText: 'בעלי עסקים נתלים במספרים', category: 'ערכי', status: 'פורסם' },
    { title: 'יום הולדת', hookText: 'רגע כנות', category: 'אישי', status: 'רעיון' },
  ];
  const result = filterIdeas(ideas, { text: 'מספרים' });
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'טעות נפוצה');
});

test('filterIdeas filters by category', () => {
  const ideas = [
    { title: 'א', hookText: '', category: 'ערכי', status: 'רעיון' },
    { title: 'ב', hookText: '', category: 'אישי', status: 'רעיון' },
  ];
  const result = filterIdeas(ideas, { category: 'אישי' });
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'ב');
});

test('filterIdeas filters by status', () => {
  const ideas = [
    { title: 'א', hookText: '', category: 'ערכי', status: 'רעיון' },
    { title: 'ב', hookText: '', category: 'ערכי', status: 'פורסם' },
  ];
  const result = filterIdeas(ideas, { status: 'פורסם' });
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'ב');
});

test('filterIdeas combines text + category + status', () => {
  const ideas = [
    { title: 'רעיון טוב', hookText: '', category: 'ערכי', status: 'רעיון' },
    { title: 'רעיון אחר', hookText: '', category: 'ערכי', status: 'פורסם' },
    { title: 'רעיון טוב', hookText: '', category: 'אישי', status: 'רעיון' },
  ];
  const result = filterIdeas(ideas, { text: 'רעיון טוב', category: 'ערכי', status: 'רעיון' });
  assert.equal(result.length, 1);
  assert.equal(result[0].category, 'ערכי');
});

test('validateIdea requires title, category, hookText', () => {
  const errors = validateIdea({ title: '', category: '', hookText: '' });
  assert.equal(errors.length, 3);
});

test('validateIdea passes with required fields filled', () => {
  const errors = validateIdea({ title: 'כותרת', category: 'ערכי', hookText: 'טקסט' });
  assert.equal(errors.length, 0);
});

test('validateIdea rejects an unknown category', () => {
  const errors = validateIdea({ title: 'כותרת', category: 'לא קיים', hookText: 'טקסט' });
  assert.equal(errors.length, 1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/ideas-logic.test.mjs`
Expected: FAIL — `Cannot find module '../js/ideas-logic.js'` (file doesn't exist yet).

- [ ] **Step 3: Implement `js/ideas-logic.js`**

```javascript
// js/ideas-logic.js
export const CATEGORIES = ['ערכי', 'אישי', 'מכירתי', 'בידורי'];
export const STATUSES = ['רעיון', 'מתוכנן', 'צולם/הוקלט', 'פורסם'];

export function nextStatus(status) {
  const i = STATUSES.indexOf(status);
  if (i === -1 || i === STATUSES.length - 1) return status;
  return STATUSES[i + 1];
}

export function prevStatus(status) {
  const i = STATUSES.indexOf(status);
  if (i <= 0) return status;
  return STATUSES[i - 1];
}

export function filterIdeas(ideas, { text = '', category = '', status = '' } = {}) {
  const needle = text.trim().toLowerCase();
  return ideas.filter((idea) => {
    if (category && idea.category !== category) return false;
    if (status && idea.status !== status) return false;
    if (needle) {
      const haystack = `${idea.title} ${idea.hookText}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

export function validateIdea({ title, category, hookText }) {
  const errors = [];
  if (!title || !title.trim()) errors.push('כותרת חובה');
  if (!category || !CATEGORIES.includes(category)) errors.push('קטגוריה לא תקינה');
  if (!hookText || !hookText.trim()) errors.push('טקסט hook חובה');
  return errors;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/ideas-logic.test.mjs`
Expected: PASS — all 12 tests green, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add js/ideas-logic.js test/ideas-logic.test.mjs
git commit -m "Add pure idea-management logic with unit tests"
```

---

### Task 3: Firebase init + auth

**Files:**
- Create: `js/firebase-init.js`
- Create: `js/auth.js`

- [ ] **Step 1: Write `js/firebase-init.js`**

Replace the placeholder values below with the exact `firebaseConfig` object copied in Task 1, Step 6.

```javascript
// js/firebase-init.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, enableIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'REPLACE_WITH_REAL_VALUE',
  authDomain: 'maya-content-ideas.firebaseapp.com',
  projectId: 'maya-content-ideas',
  storageBucket: 'maya-content-ideas.appspot.com',
  messagingSenderId: 'REPLACE_WITH_REAL_VALUE',
  appId: 'REPLACE_WITH_REAL_VALUE',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

enableIndexedDbPersistence(db).catch((err) => {
  console.warn('Offline persistence not enabled:', err.code);
});
```

- [ ] **Step 2: Write `js/auth.js`**

```javascript
// js/auth.js
import { auth } from './firebase-init.js';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const provider = new GoogleAuthProvider();

export function signInWithGoogle() {
  return signInWithPopup(auth, provider);
}

export function signOutUser() {
  return signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
```

- [ ] **Step 3: Manual verification (deferred)**

This module can't be verified standalone without `index.html` + a real Firebase project wired up — verified together with Task 7's manual checklist. No standalone test here; note it and move on.

- [ ] **Step 4: Commit**

```bash
git add js/firebase-init.js js/auth.js
git commit -m "Add Firebase init and Google auth wiring"
```

---

### Task 4: Firestore data layer

**Files:**
- Create: `js/ideas-store.js`

- [ ] **Step 1: Write `js/ideas-store.js`**

```javascript
// js/ideas-store.js
import { db, auth } from './firebase-init.js';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

function ideasCollection() {
  return collection(db, 'ideas');
}

export function subscribeToIdeas(callback) {
  const uid = auth.currentUser?.uid;
  const q = query(ideasCollection(), where('ownerUid', '==', uid));
  return onSnapshot(q, (snapshot) => {
    const ideas = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(ideas);
  });
}

export async function addIdea({ title, category, hookText, sourceLink = '', notes = '' }) {
  return addDoc(ideasCollection(), {
    title,
    category,
    hookText,
    sourceLink,
    notes,
    status: 'רעיון',
    ownerUid: auth.currentUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateIdea(id, fields) {
  return updateDoc(doc(db, 'ideas', id), { ...fields, updatedAt: serverTimestamp() });
}

export async function deleteIdea(id) {
  return deleteDoc(doc(db, 'ideas', id));
}
```

- [ ] **Step 2: Manual verification (deferred)**

Verified end-to-end in Task 7's manual checklist (requires a signed-in user + live Firestore).

- [ ] **Step 3: Commit**

```bash
git add js/ideas-store.js
git commit -m "Add Firestore data layer for ideas CRUD"
```

---

### Task 5: `index.html` skeleton + styling

**Files:**
- Create: `index.html`
- Create: `css/style.css`

- [ ] **Step 1: Write `index.html`**

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>רעיונות לתוכן</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body>

<div id="login-screen" class="screen">
  <div class="login-card">
    <h1>רעיונות לתוכן</h1>
    <button id="google-signin-btn" class="btn-primary">התחברות עם Google</button>
    <p id="login-error" class="error-text" hidden></p>
  </div>
</div>

<div id="app-screen" class="screen" hidden>
  <header class="app-header">
    <h1>רעיונות לתוכן</h1>
    <nav class="view-tabs">
      <button id="tab-board" class="tab-btn active">לוח</button>
      <button id="tab-archive" class="tab-btn">מאגר וחיפוש</button>
    </nav>
    <button id="signout-btn" class="btn-text">התנתקות</button>
  </header>

  <main id="board-view" class="view">
    <div class="board-columns" id="board-columns"></div>
  </main>

  <main id="archive-view" class="view" hidden>
    <div class="archive-controls">
      <input id="search-input" type="text" placeholder="חיפוש לפי כותרת או טקסט...">
      <select id="filter-category">
        <option value="">כל הקטגוריות</option>
        <option value="ערכי">ערכי</option>
        <option value="אישי">אישי</option>
        <option value="מכירתי">מכירתי</option>
        <option value="בידורי">בידורי</option>
      </select>
      <select id="filter-status">
        <option value="">כל הסטטוסים</option>
        <option value="רעיון">רעיון</option>
        <option value="מתוכנן">מתוכנן</option>
        <option value="צולם/הוקלט">צולם/הוקלט</option>
        <option value="פורסם">פורסם</option>
      </select>
    </div>
    <ul class="archive-list" id="archive-list"></ul>
  </main>

  <button id="add-idea-fab" class="fab">+ הוסיפי רעיון</button>
</div>

<div id="idea-modal" class="modal" hidden>
  <div class="modal-content">
    <h2 id="modal-title">רעיון חדש</h2>
    <form id="idea-form">
      <label>כותרת<input id="field-title" type="text" required></label>
      <label>קטגוריה
        <select id="field-category" required>
          <option value="ערכי">ערכי</option>
          <option value="אישי">אישי</option>
          <option value="מכירתי">מכירתי</option>
          <option value="בידורי">בידורי</option>
        </select>
      </label>
      <label>טקסט Hook<textarea id="field-hook" required></textarea></label>
      <label>לינק מקור (אופציונלי)<input id="field-link" type="url"></label>
      <label>הערות/טודו (אופציונלי)<textarea id="field-notes"></textarea></label>
      <label id="field-status-wrap" hidden>סטטוס
        <select id="field-status">
          <option value="רעיון">רעיון</option>
          <option value="מתוכנן">מתוכנן</option>
          <option value="צולם/הוקלט">צולם/הוקלט</option>
          <option value="פורסם">פורסם</option>
        </select>
      </label>
      <p id="form-error" class="error-text" hidden></p>
      <div class="modal-actions">
        <button type="button" id="delete-idea-btn" class="btn-danger" hidden>מחיקה</button>
        <button type="button" id="cancel-idea-btn" class="btn-text">ביטול</button>
        <button type="submit" class="btn-primary">שמירה</button>
      </div>
    </form>
  </div>
</div>

<script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `css/style.css`**

```css
:root {
  --bg: #14141c;
  --surface: #1f1f2b;
  --text: #f2f2f7;
  --muted: #9a9aab;
  --accent: #ffd166;
  --cat-ערכי: #2ec4b6;
  --cat-אישי: #ef476f;
  --cat-מכירתי: #ffb703;
  --cat-בידורי: #8338ec;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: 'Segoe UI', Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  direction: rtl;
}

.screen { min-height: 100vh; display: flex; flex-direction: column; }
.screen[hidden] { display: none; }

.login-card {
  margin: auto;
  text-align: center;
  background: var(--surface);
  padding: 2.5rem;
  border-radius: 16px;
}

.btn-primary {
  background: var(--accent);
  color: #14141c;
  font-weight: bold;
  border: none;
  border-radius: 10px;
  padding: 0.8rem 1.6rem;
  font-size: 1rem;
  cursor: pointer;
}

.btn-text {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  text-decoration: underline;
}

.btn-danger {
  background: var(--cat-אישי);
  color: white;
  border: none;
  border-radius: 10px;
  padding: 0.6rem 1.2rem;
  cursor: pointer;
}

.error-text { color: var(--cat-אישי); font-weight: bold; }

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  background: var(--surface);
  flex-wrap: wrap;
  gap: 0.5rem;
}

.view-tabs { display: flex; gap: 0.5rem; }

.tab-btn {
  background: transparent;
  border: 2px solid var(--muted);
  color: var(--text);
  padding: 0.5rem 1rem;
  border-radius: 999px;
  cursor: pointer;
}

.tab-btn.active {
  background: var(--accent);
  color: #14141c;
  border-color: var(--accent);
  font-weight: bold;
}

.view[hidden] { display: none; }

.board-columns {
  display: grid;
  grid-template-columns: repeat(4, minmax(260px, 1fr));
  gap: 1rem;
  padding: 1.5rem;
  overflow-x: auto;
}

@media (max-width: 900px) {
  .board-columns { grid-template-columns: 1fr; }
}

.board-column {
  background: var(--surface);
  border-radius: 14px;
  padding: 1rem;
  min-height: 200px;
}

.board-column h3 {
  margin-top: 0;
  text-align: center;
}

.idea-card {
  background: #2a2a3a;
  border-radius: 12px;
  padding: 0.9rem;
  margin-bottom: 0.8rem;
  cursor: pointer;
  border-inline-start: 6px solid var(--card-color, var(--accent));
}

.idea-card .card-title { font-weight: bold; margin-bottom: 0.4rem; }

.card-category-tag {
  display: inline-block;
  font-size: 0.75rem;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  color: #14141c;
  font-weight: bold;
  margin-bottom: 0.5rem;
  background: var(--card-color, var(--accent));
}

.card-nav {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
}

.card-nav button {
  background: none;
  border: none;
  color: var(--text);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.2rem 0.6rem;
}

.card-nav button:disabled { opacity: 0.25; cursor: default; }

.archive-controls {
  display: flex;
  gap: 0.6rem;
  padding: 1rem 1.5rem;
  flex-wrap: wrap;
}

.archive-controls input,
.archive-controls select {
  padding: 0.5rem;
  border-radius: 8px;
  border: none;
  background: var(--surface);
  color: var(--text);
}

.archive-list { list-style: none; padding: 0 1.5rem; }

.archive-list li {
  background: var(--surface);
  border-inline-start: 6px solid var(--card-color, var(--accent));
  border-radius: 10px;
  padding: 0.8rem 1rem;
  margin-bottom: 0.7rem;
  cursor: pointer;
}

.fab {
  position: fixed;
  bottom: 1.5rem;
  left: 1.5rem;
  background: var(--accent);
  color: #14141c;
  font-weight: bold;
  border: none;
  border-radius: 999px;
  padding: 1rem 1.4rem;
  box-shadow: 0 4px 14px rgba(0,0,0,0.4);
  cursor: pointer;
  font-size: 1rem;
}

.modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.modal[hidden] { display: none; }

.modal-content {
  background: var(--surface);
  border-radius: 16px;
  padding: 1.5rem;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content form label {
  display: block;
  margin-bottom: 0.9rem;
  font-size: 0.9rem;
}

.modal-content input,
.modal-content select,
.modal-content textarea {
  display: block;
  width: 100%;
  margin-top: 0.3rem;
  padding: 0.5rem;
  border-radius: 8px;
  border: none;
  background: #14141c;
  color: var(--text);
}

.modal-content textarea { min-height: 70px; resize: vertical; }

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 1rem;
}
```

- [ ] **Step 3: Commit**

```bash
git add index.html css/style.css
git commit -m "Add app HTML skeleton and dark bold-color styling"
```

---

### Task 6: Board view, archive view, idea form, app bootstrap

**Files:**
- Create: `js/board-view.js`
- Create: `js/archive-view.js`
- Create: `js/idea-form.js`
- Create: `js/app.js`

- [ ] **Step 1: Write `js/board-view.js`**

```javascript
// js/board-view.js
import { STATUSES, nextStatus, prevStatus } from './ideas-logic.js';
import { updateIdea } from './ideas-store.js';

export function renderBoard(ideas, { onCardClick }) {
  const container = document.getElementById('board-columns');
  container.innerHTML = '';

  for (const status of STATUSES) {
    const column = document.createElement('div');
    column.className = 'board-column';
    column.innerHTML = `<h3>${status}</h3>`;

    const columnIdeas = ideas.filter((idea) => idea.status === status);
    for (const idea of columnIdeas) {
      column.appendChild(renderCard(idea, onCardClick));
    }
    container.appendChild(column);
  }
}

function renderCard(idea, onCardClick) {
  const card = document.createElement('div');
  card.className = 'idea-card';
  card.style.setProperty('--card-color', `var(--cat-${idea.category})`);
  card.innerHTML = `
    <span class="card-category-tag">${idea.category}</span>
    <div class="card-title"></div>
    <div class="card-nav">
      <button type="button" class="prev-btn" ${idea.status === STATUSES[0] ? 'disabled' : ''}>◀</button>
      <button type="button" class="next-btn" ${idea.status === STATUSES[STATUSES.length - 1] ? 'disabled' : ''}>▶</button>
    </div>
  `;
  card.querySelector('.card-title').textContent = idea.title;

  card.querySelector('.card-title').addEventListener('click', () => onCardClick(idea));

  card.querySelector('.next-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    updateIdea(idea.id, { status: nextStatus(idea.status) });
  });

  card.querySelector('.prev-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    updateIdea(idea.id, { status: prevStatus(idea.status) });
  });

  return card;
}
```

- [ ] **Step 2: Write `js/archive-view.js`**

```javascript
// js/archive-view.js
import { filterIdeas } from './ideas-logic.js';

let currentIdeas = [];

export function renderArchive(ideas, { onItemClick }) {
  currentIdeas = ideas;
  applyFilters(onItemClick);
}

export function wireArchiveControls(onItemClick) {
  document.getElementById('search-input').addEventListener('input', () => applyFilters(onItemClick));
  document.getElementById('filter-category').addEventListener('change', () => applyFilters(onItemClick));
  document.getElementById('filter-status').addEventListener('change', () => applyFilters(onItemClick));
}

function applyFilters(onItemClick) {
  const text = document.getElementById('search-input').value;
  const category = document.getElementById('filter-category').value;
  const status = document.getElementById('filter-status').value;
  const filtered = filterIdeas(currentIdeas, { text, category, status });

  const list = document.getElementById('archive-list');
  list.innerHTML = '';
  for (const idea of filtered) {
    const li = document.createElement('li');
    li.style.setProperty('--card-color', `var(--cat-${idea.category})`);
    li.innerHTML = `<strong></strong> <span class="card-category-tag"></span> — <em></em>`;
    const [titleEl, tagEl, statusEl] = li.children;
    titleEl.textContent = idea.title;
    tagEl.textContent = idea.category;
    statusEl.textContent = idea.status;
    li.addEventListener('click', () => onItemClick(idea));
    list.appendChild(li);
  }
}
```

- [ ] **Step 3: Write `js/idea-form.js`**

```javascript
// js/idea-form.js
import { validateIdea } from './ideas-logic.js';
import { addIdea, updateIdea, deleteIdea } from './ideas-store.js';

let editingId = null;

export function openAddModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'רעיון חדש';
  document.getElementById('idea-form').reset();
  document.getElementById('field-status-wrap').hidden = true;
  document.getElementById('delete-idea-btn').hidden = true;
  document.getElementById('form-error').hidden = true;
  document.getElementById('idea-modal').hidden = false;
}

export function openEditModal(idea) {
  editingId = idea.id;
  document.getElementById('modal-title').textContent = 'עריכת רעיון';
  document.getElementById('field-title').value = idea.title;
  document.getElementById('field-category').value = idea.category;
  document.getElementById('field-hook').value = idea.hookText;
  document.getElementById('field-link').value = idea.sourceLink || '';
  document.getElementById('field-notes').value = idea.notes || '';
  document.getElementById('field-status').value = idea.status;
  document.getElementById('field-status-wrap').hidden = false;
  document.getElementById('delete-idea-btn').hidden = false;
  document.getElementById('form-error').hidden = true;
  document.getElementById('idea-modal').hidden = false;
}

export function closeModal() {
  document.getElementById('idea-modal').hidden = true;
  editingId = null;
}

export function wireIdeaForm() {
  document.getElementById('cancel-idea-btn').addEventListener('click', closeModal);

  document.getElementById('delete-idea-btn').addEventListener('click', async () => {
    if (!editingId) return;
    if (confirm('בטוחה שאת רוצה למחוק את הרעיון הזה?')) {
      await deleteIdea(editingId);
      closeModal();
    }
  });

  document.getElementById('idea-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      title: document.getElementById('field-title').value,
      category: document.getElementById('field-category').value,
      hookText: document.getElementById('field-hook').value,
      sourceLink: document.getElementById('field-link').value,
      notes: document.getElementById('field-notes').value,
    };
    const errors = validateIdea(data);
    const errorEl = document.getElementById('form-error');
    if (errors.length) {
      errorEl.textContent = errors.join(', ');
      errorEl.hidden = false;
      return;
    }
    if (editingId) {
      await updateIdea(editingId, { ...data, status: document.getElementById('field-status').value });
    } else {
      await addIdea(data);
    }
    closeModal();
  });
}
```

- [ ] **Step 4: Write `js/app.js`**

```javascript
// js/app.js
import { onAuthChange, signInWithGoogle, signOutUser } from './auth.js';
import { subscribeToIdeas } from './ideas-store.js';
import { renderBoard } from './board-view.js';
import { renderArchive, wireArchiveControls } from './archive-view.js';
import { openAddModal, openEditModal, wireIdeaForm } from './idea-form.js';

let unsubscribeIdeas = null;
let latestIdeas = [];

function showView(name) {
  document.getElementById('board-view').hidden = name !== 'board';
  document.getElementById('archive-view').hidden = name !== 'archive';
  document.getElementById('tab-board').classList.toggle('active', name === 'board');
  document.getElementById('tab-archive').classList.toggle('active', name === 'archive');
}

function onIdeasChanged(ideas) {
  latestIdeas = ideas;
  renderBoard(ideas, { onCardClick: openEditModal });
  renderArchive(ideas, { onItemClick: openEditModal });
}

document.getElementById('google-signin-btn').addEventListener('click', async () => {
  try {
    await signInWithGoogle();
  } catch (err) {
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = 'ההתחברות נכשלה, נסי שוב';
    errorEl.hidden = false;
  }
});

document.getElementById('signout-btn').addEventListener('click', () => signOutUser());
document.getElementById('tab-board').addEventListener('click', () => showView('board'));
document.getElementById('tab-archive').addEventListener('click', () => showView('archive'));
document.getElementById('add-idea-fab').addEventListener('click', openAddModal);

wireIdeaForm();
wireArchiveControls((idea) => openEditModal(idea));

onAuthChange((user) => {
  document.getElementById('login-screen').hidden = !!user;
  document.getElementById('app-screen').hidden = !user;

  if (unsubscribeIdeas) {
    unsubscribeIdeas();
    unsubscribeIdeas = null;
  }

  if (user) {
    unsubscribeIdeas = subscribeToIdeas(onIdeasChanged);
    showView('board');
  }
});
```

- [ ] **Step 5: Commit**

```bash
git add js/board-view.js js/archive-view.js js/idea-form.js js/app.js
git commit -m "Wire board view, archive view, add/edit form, and app bootstrap"
```

---

### Task 7: Firestore security rules

**Files:**
- Create: `firestore.rules`
- Create: `firebase.json`
- Create: `.firebaserc`

- [ ] **Step 1: Write `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /ideas/{ideaId} {
      allow read, update, delete: if request.auth != null && request.auth.uid == resource.data.ownerUid;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.ownerUid;
    }
  }
}
```

- [ ] **Step 2: Write `firebase.json`**

```json
{
  "firestore": {
    "rules": "firestore.rules"
  }
}
```

- [ ] **Step 3: Write `.firebaserc`**

```json
{
  "projects": {
    "default": "maya-content-ideas"
  }
}
```

- [ ] **Step 4: Deploy the rules**

Run: `npx firebase-tools@13 deploy --only firestore:rules`
Expected: `✔ Deploy complete!`

- [ ] **Step 5: Commit**

```bash
git add firestore.rules firebase.json .firebaserc
git commit -m "Add Firestore security rules scoped to the authenticated owner"
```

---

### Task 8: Deploy to GitHub Pages

**Files:** none new — pushes the existing working tree to a GitHub repo with Pages enabled.

- [ ] **Step 1: Create the GitHub repo**

Run: `gh repo create maya-content-ideas --private --source=. --remote=origin`
Expected: repo created, `origin` remote added.

- [ ] **Step 2: Push the code**

Run: `git push -u origin master`
Expected: branch pushed successfully.

- [ ] **Step 3: Enable GitHub Pages on the repo**

Run: `gh api repos/mayakislev-ux/maya-content-ideas/pages -X POST -f "source[branch]=master" -f "source[path]=/"`
(If this errors because Pages needs the repo public or a different owner path, guide Maya through Settings → Pages → Source → `master` branch → `/ (root)` → Save instead.)

- [ ] **Step 4: Record the live URL**

The app will be live at `https://mayakislev-ux.github.io/maya-content-ideas/` (adjust if `gh repo create` used a different owner/account than her existing `mayakislev-ux` GitHub Pages account).

---

### Task 9: End-to-end manual verification

**Files:** none — verification only.

- [ ] **Step 1: Open the live URL on desktop, sign in with Google**
Expected: login screen → after Google popup, board view appears with 4 empty columns.

- [ ] **Step 2: Add an idea via the FAB**
Fill title/category/hook, submit. Expected: card appears in the "רעיון" column immediately, color-coded to the chosen category.

- [ ] **Step 3: Move the card forward twice using ▶**
Expected: card moves to "מתוכנן" then "צולם/הוקלט"; ▶ disables at "פורסם", ◀ disables at "רעיון".

- [ ] **Step 4: Edit the card (click title) and change its notes, then save**
Expected: modal opens pre-filled, save persists the change, card re-renders.

- [ ] **Step 5: Switch to "מאגר וחיפוש" tab, search by a keyword from the hook text**
Expected: only matching ideas shown; clearing the search restores the full list. Filter by category and by status and confirm both narrow the list correctly.

- [ ] **Step 6: Delete the test idea via the edit modal's delete button**
Expected: confirmation dialog appears; confirming removes the card from both views.

- [ ] **Step 7: Open the same URL on her phone, confirm she's still signed in and sees the same (now empty) board**
Expected: real-time sync — add a card on one device, confirm it appears on the other without a manual refresh.

- [ ] **Step 8: Commit any fixes found during verification, if none needed, this task is complete with no commit.**

---

## Spec Coverage Check

- Kanban board, 4 columns, color-coded cards, tap-arrows to change status → Task 6 (`board-view.js`) + Task 2 (`nextStatus`/`prevStatus`).
- Add idea via floating button, form with all 5 fields → Task 5 (HTML) + Task 6 (`idea-form.js`).
- Edit/delete via tapping a card → Task 6 (`idea-form.js` `openEditModal` + delete button).
- Archive/search screen with text search + category/status filters → Task 6 (`archive-view.js`) + Task 2 (`filterIdeas`).
- Firebase Firestore sync across devices, Google login → Task 1, Task 3, Task 4.
- Security scoped to her own uid only → Task 7.
- Dark bold color-coded visual style → Task 5 (`style.css`).
- Manual-only idea entry (no auto-import) → satisfied by omission; no import code written anywhere in this plan.
- Hosting on GitHub Pages → Task 8.
