const DURATION_MS = 500;
const previousValues = new WeakMap();

/**
 * Animates the numeric part of an element's text from its previous rendered
 * value up (or down) to `value`, keeping `suffix` static. Falls back to an
 * instant set on first render (no previous value to animate from) and when
 * the user prefers reduced motion.
 */
export function animateCountUp(el, value, suffix = '') {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const from = previousValues.has(el) ? previousValues.get(el) : value;
  previousValues.set(el, value);

  if (prefersReduced || from === value) {
    el.textContent = `${value}${suffix}`;
    return;
  }

  const start = performance.now();
  function tick(now) {
    const progress = Math.min(1, (now - start) / DURATION_MS);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(from + (value - from) * eased);
    el.textContent = `${current}${suffix}`;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
