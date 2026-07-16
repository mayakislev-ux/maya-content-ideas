# Design System — המוח השיווקי

Status: approved direction, not yet applied to code.
Direction chosen by Maya: **"סגול חם ומאופק"** (Warm, Restrained Violet) — keep the existing purple brand identity, but execute it with restraint and a real type system instead of gradients-everywhere and a missing body font.

## Why (diagnosis, not opinion)

Read directly from the current `css/style.css` and `index.html`:

1. **No body webfont.** `Ploni Black` (a licensed premium Hebrew display font) is declared `font-weight: 900` only, used for headings. Every other line of text falls back to `'Segoe UI', Arial, sans-serif` — i.e. whatever the OS ships. There is no `<link>` to any webfont in `index.html` at all. This is the single biggest "unfinished" signal: a premium headline font sitting on top of a default system font for everything else.
2. **Gradient overuse.** `linear-gradient(135deg, var(--accent), var(--accent-2))` appears ~10 times across buttons, headers, badges, and avatars. Repeating the same gradient on every interactive surface reads as a 2015-era SaaS template, not a considered brand. Research on 2026 product design (Linear, Notion, Superhuman, and current AI-chat UI trends) converges on the opposite: **one accent color, used flat, with gradient reserved for at most one hero moment** — restraint signals craft.
3. **No radius system.** 38 distinct `border-radius` declarations ranging from `6px` to `999px` with no visible logic — cards, chips, and buttons each pick their own value ad hoc. A 3-tier system (below) replaces this.
4. **Category colors are neon, not tonal.** `#2ecc71 / #ff4d9d / #e63946 / #3a86ff` — four fully-saturated hues with no shared logic, next to each other they read as "rainbow" rather than "palette."

Everything below fixes these four things specifically. Nothing here is a rebrand — the purple identity, the Ploni Black headline font, and the app's actual layout structure all stay.

## Color

```css
:root {
  /* surfaces */
  --bg: #faf9fc;            /* was #ffffff — faint warm-lavender tint instead of stark white */
  --surface: #f4f2fa;       /* unchanged, already correct */
  --card-bg: #ffffff;
  --border-color: #e3ddf2;  /* slightly softer than current #ddd8ee */

  /* text */
  --text: #211d2e;          /* unchanged, already correct */
  --muted: #706b85;         /* unchanged, already correct */

  /* accent — flat, used directly, no gradient except the one reserved hero spot */
  --accent: #7c3aed;             /* unchanged — this IS the brand, keep it */
  --accent-strong: #5b21b6;      /* NEW — for headline-weight text on light bg, better contrast than --accent */
  --accent-2: #a78bfa;           /* kept ONLY for the single reserved gradient use (see Gradient Policy) */
  --accent-tint: #f1ebfd;        /* NEW — for selected/active state backgrounds, replaces ad hoc light-purple fills */

  /* category colors — same hue families, desaturated ~15-20% and matched in lightness so they read as a set */
  --cat-baal-erech: #2f9e64;   /* was #2ecc71 */
  --cat-ishi: #c94a8c;         /* was #ff4d9d */
  --cat-mechirti: #c94b52;     /* was #e63946 */
  --cat-biduri: #3568c9;       /* was #3a86ff */
  --cat-default: var(--accent);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #17141f;
    --surface: #211d2c;
    --card-bg: #262233;
    --border-color: #3a3450;
    --text: #f1eef8;
    --muted: #a89fc0;
    --accent-strong: #c4aefc;   /* NEW dark-mode counterpart */
    --accent-2: #c4aefc;
    --accent-tint: #2e2740;
  }
}
```

**Gradient policy:** the `linear-gradient(135deg, --accent, --accent-2)` treatment is retired from buttons, chips, avatars, and badges — those become flat `var(--accent)`. It is kept in exactly **one** place: the main app header/top bar, as the one deliberate brand flourish. Everywhere else, flat color + the hairline border/elevation rules below carry the visual weight.

## Typography

Add to `index.html` `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap" rel="stylesheet">
```

```css
--font-heading: 'Ploni Black', 'Heebo', sans-serif;  /* h1/h2 and hero moments only */
--font-body: 'Heebo', 'Segoe UI', Arial, sans-serif;  /* everything else: body, buttons, nav, labels, chat */
```

Heebo is Google's purpose-built Hebrew companion typeface (pairs with Roboto's proportions), free, and considered the standard default for modern Hebrew interfaces — it's the correct professional replacement for the current system-font fallback.

**Type scale** (rem, 1rem = 16px base):
| Token | Size | Line-height | Use |
|---|---|---|---|
| `--text-xs` | 0.8125rem | 1.4 | timestamps, meta |
| `--text-sm` | 0.875rem | 1.5 | secondary text, labels |
| `--text-base` | 1rem | 1.6 | body, chat bubbles |
| `--text-lg` | 1.125rem | 1.5 | card titles |
| `--text-xl` | 1.375rem | 1.4 | section headers |
| `--text-2xl` | 1.75rem | 1.3 | page titles (Ploni Black) |
| `--text-3xl` | 2.25rem | 1.2 | hero/onboarding only (Ploni Black) |

## Spacing

4px base unit, replacing ad hoc padding values:
```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
--space-8: 32px;
--space-12: 48px;
--space-16: 64px;
```
Applied going forward when touching a component — not a one-shot find/replace across all 1,700+ lines of existing CSS (too high risk of regression for zero visible benefit). Every new/redesigned component uses these tokens.

## Radius (3 tiers, replaces the current 38 ad hoc values)

```css
--radius-sm: 8px;   /* buttons, chips, inputs, small controls */
--radius-md: 12px;  /* cards, modals, chat bubbles */
--radius-full: 999px; /* avatars, pills, toggle switches — genuinely circular/pill elements only */
```
No more one-off values like `14px`, `16px`, `18px` scattered per-component.

## Elevation / borders

Replace heavy drop-shadows with hairline borders + minimal shadow, matching the "restrained" direction:
```css
--elevation-card: 0 1px 2px rgba(33, 29, 46, 0.04);
--elevation-modal: 0 8px 24px rgba(33, 29, 46, 0.12);
```
Cards/panels: `1px solid var(--border-color)` + `--elevation-card`. Reserve `--elevation-modal` for anything that floats above the page (modals, popovers, the token-usage panel) — not for ordinary cards.

## Motion

No change to existing `prefers-reduced-motion` handling (already correct). New rule for consistency: interactive-state transitions (hover, focus, active) use `150ms ease`; view/panel transitions use `200ms ease`. No bounce/spring easing — matches the restrained direction, not the playful one.

## Buttons (concrete before/after)

- Primary: was gradient background → now flat `var(--accent)`, white text, `--radius-sm`, `150ms ease` hover to `var(--accent-strong)`.
- Secondary/outline: keep the existing `2px solid var(--accent)` pattern (already correct), just align radius to `--radius-sm`.
- Category chips: flat `var(--chip-color)` at reduced opacity background (`--accent-tint`-style tinting) instead of solid saturated fill, for less visual noise when many chips sit together.

## Rollout plan

1. Apply color tokens + font loading + radius/spacing tokens to `css/style.css` root and shared primitives (buttons, cards, chips) first — highest visual impact, lowest risk, touches shared classes only.
2. Re-skin each view against the new tokens: idea-chat, script-chat, archive, warming/story tool, guide, onboarding tour, modals.
3. Re-check the two mobile fixes already shipped (notch padding, close-button overlap) still hold after the header/button restyle.
4. Only after this is live and confirmed working, resume the 50-feature backlog in prioritized batches.
