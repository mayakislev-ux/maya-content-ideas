/* 11/11/2026 (מאיה: "בואי נזרום ונמשיך איתה"): הדמות התלת־ממדית בעוזר לסרטון,
   בטלפון, בחצי גוף מעל התיבה במקום הראש העגול. היא חיה: נושמת, מטה את הראש
   לכיוון האצבע או התיבה שכותבים בה, מהנהנת כשכותבים, וקופצת כשנוגעים בה.
   בלי סיבובים לצדדים: הצבעים באים מתמונה אחת מלפנים, וסיבוב לצד מעוות את
   הפנים (מאיה ראתה את זה בעמוד הניסיון maya3d.html).
   הספרייה והמודל נטענים רק כשצריך, ואם משהו נכשל נשאר הראש העגול. */

const THREE_URL = 'https://esm.sh/three@0.160.0';
const GLTF_URL = 'https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
const MODEL_URL = 'assets/maya/maya3d.glb?v=2';
const NECK = '1.33';

let libP = null;
let ready = null; /* { THREE, renderer, scene, camera, model, U } */
let failed = false;
let running = false;
const state = { tilt: 0, pitch: 0, tTilt: 0, tPitch: 0, lastAim: -1e9, hopAt: -1, nodAt: -1 };

function canWebGL() {
  try {
    const c = document.createElement('canvas');
    const gl = window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'));
    /* משחררים את הבדיקה, כדי לא להחזיק הקשר גרפי נוסף */
    const lose = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return Boolean(gl);
  } catch { return false; }
}

/** הטעינה נכשלה (או שהטלפון זרק את הגרפיקה): נשאר הראש העגול */
export function maya3dFailed() { return failed; }

/* באייפון הגרפיקה נזרקת לפעמים בלחץ זיכרון. אז חוזרים לראש העגול. */
function onContextLost(e) {
  if (e && e.preventDefault) e.preventDefault();
  failed = true;
  running = false;
  document.querySelectorAll('.va-maya.is-3d').forEach((f) => f.classList.remove('is-3d'));
  document.querySelectorAll('.has-maya3d').forEach((v) => v.classList.remove('has-maya3d'));
  const c = ready && ready.renderer.domElement;
  if (c && c.parentNode) c.parentNode.removeChild(c);
}

function rig(material, U) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uPitch; uniform float uRoll; uniform float uBreath;
        mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
        mat3 rotZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        float y = transformed.y;
        float ch = smoothstep(0.98, 1.10, y) * (1.0 - smoothstep(1.22, 1.30, y)) * (1.0 - smoothstep(0.13, 0.17, abs(transformed.x)));
        transformed.x *= 1.0 + 0.012 * uBreath * ch;
        transformed.z *= 1.0 + 0.022 * uBreath * ch;
        float hw = smoothstep(${NECK} - 0.05, ${NECK} + 0.05, y);
        vec3 piv = vec3(0.0, ${NECK}, 0.0);
        vec3 r = rotX(uPitch) * (rotZ(uRoll) * (transformed - piv)) + piv;
        transformed = mix(transformed, r, hw);`);
  };
  return material;
}

async function load() {
  if (ready || failed) return ready;
  if (!libP) {
    libP = (async () => {
      if (!canWebGL()) throw new Error('no webgl');
      const [THREE, { GLTFLoader }] = await Promise.all([import(/* @vite-ignore */ THREE_URL), import(/* @vite-ignore */ GLTF_URL)]);
      const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.domElement.className = 'va-maya3d';
      renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);
      const scene = new THREE.Scene();
      /* חצי גוף: מהמותניים ומעלה */
      const camera = new THREE.PerspectiveCamera(24, 0.78, 0.1, 20);
      const U = { uPitch: { value: 0 }, uRoll: { value: 0 }, uBreath: { value: 0 } };
      const model = new THREE.Group();
      gltf.scene.traverse((o) => {
        if (o.isMesh) o.material = rig(new THREE.MeshBasicMaterial({ map: o.material.map }), U);
      });
      model.add(gltf.scene);
      scene.add(model);
      return { THREE, renderer, scene, camera, model, U };
    })();
  }
  try {
    ready = await libP;
  } catch (err) {
    failed = true;
    console.warn('maya3d unavailable:', err);
  }
  return ready;
}

function frame(r, w, h) {
  r.renderer.setSize(w, h, false);
  r.camera.aspect = w / h;
  const fitH = 0.86;
  const d = (fitH / 2) / Math.tan(r.THREE.MathUtils.degToRad(r.camera.fov) / 2);
  r.camera.position.set(0, 1.42, d);
  r.camera.lookAt(0, 1.4, 0);
  r.camera.updateProjectionMatrix();
}

/** לאן היא מסתכלת: נקודה על המסך (האצבע, או התיבה שכותבים בה) */
export function maya3dAim(clientX, clientY) {
  if (!ready) return;
  const canvas = ready.renderer.domElement;
  const box = canvas.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height * 0.3;
  const dx = (clientX - cx) / Math.max(200, window.innerWidth * 0.6);
  const dy = (clientY - cy) / Math.max(300, window.innerHeight * 0.6);
  state.tTilt = Math.max(-0.14, Math.min(0.14, -dx * 0.16));
  state.tPitch = Math.max(-0.05, Math.min(0.09, dy * 0.09));
  state.lastAim = performance.now();
}

/** הנהון קטן (כשכותבים) */
export function maya3dNod() { state.nodAt = performance.now(); }
/** קפיצה קטנה (כשנוגעים בה או כשהיא אומרת משהו) */
export function maya3dHop() { state.hopAt = performance.now(); }

function loop(now) {
  if (!ready) { running = false; return; }
  const canvas = ready.renderer.domElement;
  if (!canvas.isConnected) { running = false; return; }
  if (document.hidden || canvas.closest('[hidden]')) { requestAnimationFrame(loop); return; }
  const t = now / 1000;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let tt = state.tTilt;
  let tp = state.tPitch;
  if (now - state.lastAim > 4000) {
    tt = Math.sin(t * 0.37) * 0.06;
    tp = Math.sin(t * 0.29 + 1.3) * 0.03;
  }
  const k = reduce ? 1 : 0.07;
  state.tilt += (tt - state.tilt) * k;
  state.pitch += (tp - state.pitch) * k;
  let nod = 0;
  if (state.nodAt > 0) {
    const p = (now - state.nodAt) / 420;
    if (p >= 1) state.nodAt = -1; else nod = Math.sin(p * Math.PI) * 0.07;
  }
  const { U, model } = ready;
  U.uRoll.value = reduce ? 0 : state.tilt + Math.sin(t * 0.5) * 0.015;
  U.uPitch.value = state.pitch + nod;
  U.uBreath.value = reduce ? 0 : Math.sin(t * 1.7) * 0.5 + 0.5;
  model.rotation.z = reduce ? 0 : state.tilt * 0.2 + Math.sin(t * 0.8) * 0.008;
  let hop = 0;
  if (state.hopAt > 0) {
    const p = (now - state.hopAt) / 480;
    if (p >= 1) state.hopAt = -1; else hop = Math.sin(p * Math.PI) * 0.05;
  }
  model.position.y = reduce ? 0 : hop;
  ready.renderer.render(ready.scene, ready.camera);
  requestAnimationFrame(loop);
}

/** מכניס את הדמות התלת־ממדית לתוך הדמות שבכרטיס. true כשהצליח. */
export async function mountMaya3d(fig, { onTap } = {}) {
  if (!fig || failed) return false;
  const r = await load();
  if (!r || failed || !fig.isConnected) return false;
  const canvas = r.renderer.domElement;
  if (canvas.parentNode !== fig) fig.prepend(canvas);
  /* 11/11/2026 (מאיה: "קטנה מדי, וחתוכה מעל הריבוע"): גדולה יותר, ויוצאת מתוך הכרטיס */
  const w = 130;
  const h = 160;
  frame(r, w, h);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  if (!canvas._wired) {
    canvas._wired = true;
    canvas.addEventListener('click', () => { maya3dHop(); if (canvas._onTap) canvas._onTap(); });
  }
  canvas._onTap = onTap || null;
  fig.classList.add('is-3d');
  if (!running) { running = true; requestAnimationFrame(loop); }
  return true;
}

let wired = false;
/** מבט לאצבע ולתיבה שכותבים בה, והנהון בזמן כתיבה */
export function wireMaya3dLook(root) {
  if (wired || typeof document === 'undefined') return;
  wired = true;
  document.addEventListener('pointerdown', (e) => { if (root.contains(e.target)) maya3dAim(e.clientX, e.clientY); }, { passive: true });
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!root.contains(el) || !/^(TEXTAREA|INPUT)$/.test(el.tagName)) return;
    const b = el.getBoundingClientRect();
    maya3dAim(b.left + b.width / 2, b.top + 20);
  });
  let lastNod = 0;
  document.addEventListener('input', (e) => {
    if (!root.contains(e.target)) return;
    const now = performance.now();
    if (now - lastNod > 2200) { lastNod = now; maya3dNod(); }
    state.lastAim = now;
  });
}
