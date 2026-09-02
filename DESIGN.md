---
version: alpha
name: Limen
description: "A clean, confident B2B release-evidence gate with one technical flourish: a single chromatic threshold line, a quiet dot-grid field, flat UI chrome, and a glossy isometric evidence mesh."
colors:
  primary: "#1F1F23"
  ink: "#1F1F23"
  background: "#FFFFFF"
  white: "#FFFFFF"
  muted: "#71717A"
  mutedDark: "#52525B"
  border: "#E4E4E7"
  badgeFill: "#F4F4F5"
  dotGrid: "#E5E5EA"
  violet: "#7C3AED"
  indigo: "#4C1D95"
  violetHover: "#8B5CF6"
  indigoHover: "#5B21B6"
  glitchCyan: "#67C6F0"
  nodePurple: "#A78BFA"
  nodeBlue: "#60A5FA"
  tileLavender: "#C4B5FD"
  tileViolet: "#8B5CF6"
  tileIndigo: "#6366F1"
  connector: "#D4D4D8"
  logoMuted: "#52525B"
  passFill: "#DCFCE7"
  passInk: "#166534"
  holdFill: "#FFEDD5"
  holdInk: "#9A3412"
  reviewFill: "#EDE9FE"
  reviewInk: "#5B21B6"
  errorFill: "#FEE2E2"
  errorInk: "#991B1B"
typography:
  display-1:
    fontFamily: "Inter, sans-serif"
    fontSize: "44px"
    fontWeight: 600
    lineHeight: "48px"
    letterSpacing: "-1px"
  display-1-mobile:
    fontFamily: "Inter, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: "32px"
    letterSpacing: "-0.5px"
  display-2:
    fontFamily: "Inter, sans-serif"
    fontSize: "36px"
    fontWeight: 600
    lineHeight: "40px"
    letterSpacing: "-0.5px"
  body-large:
    fontFamily: "Inter, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: "26px"
    letterSpacing: "0px"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "22px"
    letterSpacing: "0px"
  nav-label:
    fontFamily: "Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "20px"
    letterSpacing: "0px"
  button:
    fontFamily: "Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "20px"
    letterSpacing: "0px"
  badge:
    fontFamily: "Inter, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "18px"
    letterSpacing: "0px"
  trust-label:
    fontFamily: "Inter, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
    letterSpacing: "0.5px"
  evidence:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
    letterSpacing: "0px"
  evidence-strong:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
    letterSpacing: "0px"
rounded:
  pill: "9999px"
  button: "10px"
  input: "10px"
  card: "12px"
  tile: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"
  4xl: "64px"
  hero: "96px"
components:
  primary-button:
    backgroundColor: "{colors.violet}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "12px 24px"
    height: "44px"
  primary-button-pressed:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "12px 24px"
    height: "44px"
  secondary-button:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "12px 24px"
    height: "44px"
  pill-badge:
    backgroundColor: "{colors.badgeFill}"
    textColor: "{colors.mutedDark}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "6px 16px"
  evidence-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
    padding: "24px"
  evidence-card-muted:
    backgroundColor: "{colors.badgeFill}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
    padding: "24px"
  evidence-record:
    backgroundColor: "{colors.white}"
    textColor: "{colors.primary}"
    typography: "{typography.evidence}"
    rounded: "{rounded.card}"
    padding: "16px"
  pass-label:
    backgroundColor: "{colors.passFill}"
    textColor: "{colors.passInk}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  hold-label:
    backgroundColor: "{colors.holdFill}"
    textColor: "{colors.holdInk}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  review-label:
    backgroundColor: "{colors.reviewFill}"
    textColor: "{colors.reviewInk}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  error-label:
    backgroundColor: "{colors.errorFill}"
    textColor: "{colors.errorInk}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  text-input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.input}"
    padding: "0px 16px"
    height: "44px"
  glitch-line:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.glitchCyan}"
    typography: "{typography.display-1}"
    rounded: "0px"
  node-card:
    backgroundColor: "{colors.nodePurple}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.tile}"
    padding: "12px"
  diamond-tile:
    backgroundColor: "{colors.tileViolet}"
    rounded: "{rounded.tile}"
  primary-button-hover:
    backgroundColor: "{colors.violetHover}"
    rounded: "{rounded.button}"
    height: "44px"
  primary-button-active-hover:
    backgroundColor: "{colors.indigoHover}"
    rounded: "{rounded.button}"
    height: "44px"
  navigation-label:
    backgroundColor: "{colors.white}"
    textColor: "{colors.muted}"
    typography: "{typography.nav-label}"
    rounded: "0px"
    padding: "4px"
  hairline-divider:
    backgroundColor: "{colors.border}"
    rounded: "0px"
    height: "1px"
  hero-dot-grid:
    backgroundColor: "{colors.dotGrid}"
    rounded: "0px"
  node-card-highlight:
    backgroundColor: "{colors.nodeBlue}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.tile}"
    padding: "4px"
  diamond-tile-back:
    backgroundColor: "{colors.tileLavender}"
    rounded: "{rounded.tile}"
  diamond-tile-front:
    backgroundColor: "{colors.tileIndigo}"
    rounded: "{rounded.tile}"
  evidence-connector:
    backgroundColor: "{colors.connector}"
    rounded: "0px"
    height: "1px"
  trust-logo:
    backgroundColor: "{colors.white}"
    textColor: "{colors.logoMuted}"
    typography: "{typography.trust-label}"
    rounded: "0px"
    padding: "4px"
---

## Overview

Limen keeps the supplied reference system’s visual substrate intact: a white base, one Inter family, a faint dot-grid field, flat grayscale UI, a single purple-to-indigo gradient, one restrained chromatic-aberration moment, muted integration marks and a glossy isometric illustration.

The category meaning changes completely. The system is no longer about generic automated decisioning. It is about the point where release evidence becomes a permission decision.

### The visual territory

> **The Evidence Mesh at the Release Threshold.**

Limen should feel calm before it feels technical. The interface gives the decision and next action priority; the illustration supplies the one expressive technical flourish.

### Preserve / replace / reinterpret

| Layer | Keep | Limen adaptation |
|---|---|---|
| Preserve | White base, dot grid, Inter, generous spacing, centered hero, flat UI chrome, 10px controls, 12px cards, no UI shadows. | These remain the formal foundation. |
| Replace | Generic B2B “automation” language, abstract node-network meaning, generic trust bar and “Get Started” logic. | Replace with release evidence, repository facts, Telegraph routing, policy and receipts. |
| Reinterpret | Glitch headline, glossy node cards, isometric diamond cluster, grayscale trust row and card surfaces. | Glitch becomes the threshold moment; the node cluster becomes the Evidence Mesh; trust row becomes integrations/proof; cards become decision and evidence records. |

### Signature hero

Use a centred, single-column hero:

```text
[RELEASE EVIDENCE GATE]

LET EVIDENCE SET
THE THRESHOLD       <- the only glitch-treated line

Repository facts + independently routed Telegraph CVE evidence,
compared against the policy your release already lives by.

[RUN A RELEASE CHECK] [INSPECT THE PROOF]

GitHub   Dependabot   Telegraph   Base Sepolia

                 [Evidence Mesh illustration]
```

The chromatic-aberration treatment belongs to exactly one line: **THE THRESHOLD**. Do not apply it to the Limen wordmark, status labels, cards, body copy or buttons.

### Product-specific visual asset: Evidence Mesh

The isometric illustration retains its glossy diamond-tile construction, but each tile now represents a named part of the actual product flow:

- repository exposure;
- Telegraph route;
- paid x402 request;
- policy evaluation;
- `PASS`, `HOLD` or `REVIEW`;
- receipt/provenance.

Thin connector lines show evidence provenance, not a generic blockchain network. The mesh must remain understandable as a diagram of a decision path even when simplified for mobile.

### Product rule

> **If a visual element does not make evidence, provenance, policy or next action easier to understand, remove it.**

### What Limen must not look like

Do not turn the system into a fortress, lock vendor, red-alert SOC dashboard, trading terminal, crypto interface, generic AI platform or “cyberpunk” product. No oversized shields, robot heads, neon circuit boards, floating holograms or purple-blue glow on black without a real product job.

## Colors

### Primary and neutral palette

- **Ink — `#1F1F23`**: headline text, wordmark, primary UI text and outlines.
- **White Base — `#FFFFFF`**: page background and primary card surface.
- **Muted Gray — `#71717A`**: navigation, body copy, secondary metadata and trust labels.
- **Muted Dark — `#52525B`**: badge text and supporting labels.
- **Light Gray — `#E4E4E7`**: card borders, secondary button borders and quiet dividers.
- **Badge Fill — `#F4F4F5`**: neutral pill badges and low-emphasis evidence surfaces.
- **Dot Grid — `#E5E5EA`**: low-opacity hero texture only.

### Limen accent palette

- **Violet — `#7C3AED`**: start of the primary CTA gradient, active links and the core of the single glitch treatment.
- **Deep Indigo — `#4C1D95`**: end of the primary CTA gradient and pressed/active CTA state.
- **Glitch Cyan — `#67C6F0`**: chromatic ghost copy in the single threshold line only.

### Integration illustration palette

- **Node Purple — `#A78BFA`** and **Node Blue — `#60A5FA`**: glossy node cards.
- **Tile Lavender — `#C4B5FD`**, **Tile Violet — `#8B5CF6`** and **Tile Indigo — `#6366F1`**: isometric Evidence Mesh facets.
- **Connector Gray — `#D4D4D8`**: thin evidence-routing lines.
- **Logo Muted — `#A1A1AA`**: grayscale integration labels/marks.

### Decision-state palette

Decision colours are semantic system signals, not brand decoration. Every state includes text, shape and a plain-language explanation; colour is never the only carrier of meaning.

| State | Fill | Text | Meaning |
|---|---|---|---|
| `PASS` | `#DCFCE7` | `#166534` | Evidence supports proceeding under policy. |
| `HOLD` | `#FFEDD5` | `#9A3412` | Repository evidence matches a blocking policy condition. |
| `REVIEW` | `#EDE9FE` | `#5B21B6` | Evidence is missing, conflicting, malformed or unavailable. |
| System error | `#FEE2E2` | `#991B1B` | Product/infrastructure error requiring attention. |

### Gradient rules

The purple-to-indigo gradient is the system’s one strong colour statement:

```css
linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)
```

Use it only for:

1. the primary CTA; and
2. the single glitch-treated threshold line.

The isometric Evidence Mesh may use its own glossy tile gradients because that depth belongs to the illustration layer. Do not flatten that gradient into cards, badges or the page background. Do not introduce a new general-purpose gradient.

### Accessibility

- Use Ink on White for primary text.
- Use `#166534` on `#DCFCE7`, `#9A3412` on `#FFEDD5`, `#5B21B6` on `#EDE9FE` and `#991B1B` on `#FEE2E2` for state labels.
- Do not use Threshold colour or Glitch Cyan as small body text on White.
- Do not make `HOLD` synonymous with red; the word and policy reason are required.
- Every focus state must be visible without relying on the dot grid or chromatic effect.

## Typography

### Font family

**Primary:** Inter, sans-serif — used for every interface and brand role.

**Evidence:** IBM Plex Mono, monospace — used only for source labels, CVE IDs, hashes, timestamps, policy keys, cost, latency and other evidence values.

**Fallback:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` for Inter; `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` for evidence.

The single Inter family preserves the reference system’s calm hierarchy. IBM Plex Mono is a functional data layer, not a second expressive display voice.

### Type hierarchy

| Role | Font | Size | Weight | Line height | Letter spacing | Use |
|---|---|---:|---:|---:|---:|---|
| Display 1 | Inter | 44px | 600 | 48px | -1px | Hero headline; second line receives the sole glitch treatment. |
| Display 1 mobile | Inter | 28px | 600 | 32px | -0.5px | Mobile hero. |
| Display 2 | Inter | 36px | 600 | 40px | -0.5px | Product surface titles. |
| Body Large | Inter | 17px | 400 | 26px | 0px | Hero subhead and key explanation. |
| Body | Inter | 15px | 400 | 22px | 0px | Interface and supporting copy. |
| Nav Label | Inter | 15px | 400 | 20px | 0px | Navigation. |
| Button | Inter | 15px | 600 | 20px | 0px | CTAs and controls. |
| Badge | Inter | 13px | 500 | 18px | 0px | State and category pills. |
| Trust Label | Inter | 13px | 400 | 18px | 0.5px | Integration/proof row. |
| Evidence | IBM Plex Mono | 13px | 400 | 18px | 0px | Metadata and source values. |
| Evidence Strong | IBM Plex Mono | 14px | 500 | 20px | 0px | IDs, outcomes and key facts. |

### Typography rules

- Keep the whole expressive system to Inter; hierarchy comes from size and weight.
- Reserve negative letter spacing for display roles.
- Use all caps sparingly for short labels such as `CVE_LOOKUP`, `PASS`, `HOLD` and `REVIEW`.
- Never set long explanatory paragraphs in monospace.
- The glitch treatment belongs to exactly one headline line per page.
- Do not use the glitch treatment for a status or error; status must remain stable and easy to scan.

## Layout

### Spacing system

Base unit: `4px`.

| Token | Value | Use |
|---|---:|---|
| xs | 4px | Icon-to-label gaps. |
| sm | 8px | Compact internal spacing. |
| md | 12px | Button vertical padding and control gaps. |
| lg | 16px | Standard component gutters. |
| xl | 24px | Button horizontal padding and heading-to-subhead gap. |
| 2xl | 32px | Subhead-to-button gap and card groups. |
| 3xl | 48px | Button-to-proof row gap. |
| 4xl | 64px | Proof row-to-illustration gap. |
| hero | 96px | Top hero breathing room. |

### Landing-page grid

- Max width: `1200px`, centred.
- Header spans the full width.
- Hero remains fully centred and single-column: badge → headline → subhead → buttons → proof row → Evidence Mesh.
- The dot grid appears behind the hero and fades to plain White further down.
- The illustration may exceed the text column but stays within the overall container.
- Keep the visual pacing generous. Do not compress the hero to fit more claims.

### Product control-room grid

The landing page preserves the centred reference composition. Inside the product, use a narrow evidence column with a restrained supporting rail only when it improves scanability:

1. decision state;
2. next action;
3. one-sentence reason;
4. repository evidence;
5. Telegraph evidence;
6. policy checks;
7. receipt/provenance.

The control room is not a dashboard collage. Use one main decision surface and a small number of evidence records.

### Responsive information order

On mobile, reorder information rather than merely shrinking it:

```text
DECISION
NEXT ACTION
PLAIN-LANGUAGE REASON
REPOSITORY EVIDENCE
TELEGRAPH EVIDENCE
POLICY CHECK
RECEIPT
```

Do not hide the decision, evidence source or next action in a horizontal scroll.

### Breakpoints

| Name | Width | Behaviour |
|---|---:|---|
| Mobile | 375–599px | Hamburger navigation; 28px headline; proof labels wrap; Evidence Mesh simplifies. |
| Tablet | 600–1023px | 36px headline; illustration scales proportionally; one-column decision surface. |
| Desktop | 1024–1439px | Full 44px hero; complete mesh detail; centred 1200px container. |
| Wide | 1440px+ | Preserve 1200px content width; add whitespace, not more dashboard density. |

### Touch targets

- Minimum: `44px × 44px`.
- Buttons use `44px` height.
- Focus rings must remain visible against White, the dot grid and pale state fills.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Flat | No shadow | Navigation, badges, secondary buttons, evidence cards and body surfaces. |
| Gradient weight | Purple-to-indigo gradient with no shadow | Primary CTA and sole glitch colour statement. |
| Glossy 3D | Tile gradient, controlled highlight and connector lines | Evidence Mesh illustration only. |
| Ambient | Soft, wide, low-opacity shadow | Beneath the illustration group only. |

The UI does not borrow the illustration’s gloss. Limen’s confidence comes from the hierarchy and evidence, not from glass, blur or ornamental elevation.

## Shapes

### Radius scale

- `9999px` — pills and decision-state labels.
- `10px` — primary/secondary buttons and text inputs.
- `12px` — evidence cards, record surfaces, node cards and isometric tile facets.
- `0px` — navigation chrome and rules.

### Evidence Mesh geometry

- Isometric rhombus/diamond facets arranged as a restrained cluster of 6–7 tiles.
- Connector nodes sit at tile vertices.
- Connector lines are `1px` and use Connector Gray.
- Each tile has a named label in adjacent or accessible text; never rely on abstract geometry alone.
- On mobile, simplify lines before removing the evidence stages.

### Card styling

Cards remain quiet, white and outlined:

- White fill;
- `1px solid #E4E4E7` border;
- `12px` radius;
- `24px` padding for primary evidence cards;
- `16px` padding for dense evidence records;
- no drop shadow;
- no glass blur;
- no decorative gradient fill.

A card is justified when it groups one decision or one source of evidence. Do not place every sentence inside its own card.

## Components

### Primary button — Run a release check

- Background: `linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)`.
- Text: White.
- Padding: `12px 24px`.
- Height: `44px`.
- Radius: `10px`.
- Font: Inter, `15px`, `600`.
- Icon: small arrow or terminal/run mark, optional; never a shield by default.
- Shadow: none.
- Hover: shift stops slightly toward `#8B5CF6` → `#5B21B6` without adding shadow.
- Pressed: deepen toward Deep Indigo; maintain visible focus.
- Copy should be specific to the workflow: `Run a release check`, not `Get Started`.

### Secondary button — Inspect the proof

- Background: White.
- Text: Ink.
- Border: `1px solid #E4E4E7`.
- Padding: `12px 24px`.
- Height: `44px`.
- Radius: `10px`.
- Shadow: none.
- Hover: `#FAFAFA` background and darker border.

### Pill badge

Use for short, factual context:

- Background: Badge Fill.
- Text: Muted Dark.
- Border: `1px solid #E4E4E7`.
- Radius: `9999px`.
- Padding: `6px 16px`.
- Example: `RELEASE EVIDENCE GATE`, `CVE_LOOKUP`, `BASE SEPOLIA`.

Do not use pills for every navigation item or every sentence.

### Decision labels

Every label includes state text, semantic fill, a shape cue and a reason beneath or beside it.

- `PASS`: check shape, Pass Fill, Pass Ink.
- `HOLD`: horizontal stop bar, Hold Fill, Hold Ink.
- `REVIEW`: open circle/question shape, Review Fill, Review Ink.

The label itself is never the full explanation.

### Evidence card

Use the card styling from the reference system, but give it a clear evidence role:

- source label: `GITHUB / DEPENDABOT` or `TELEGRAPH / CVE_LOOKUP`;
- primary value: CVE, package, version or result;
- evidence metadata in IBM Plex Mono;
- source timestamp;
- optional link to sanitized proof;
- no unsupported confidence percentage.

### Evidence record

For dense source details, use a smaller outlined record with:

- key/value rows;
- one source badge;
- monospaced ID/timestamp/cost/latency values;
- visible missing fields rather than blank placeholders.

### Policy rule row

Show:

- policy key;
- observed repository value;
- expected rule;
- result;
- one-sentence interpretation.

Example:

```text
block_severity     HIGH        critical, high       MATCH → HOLD
```

### Text input

- White fill.
- `1px solid #E4E4E7` border.
- `10px` radius.
- `44px` height.
- `0 16px` horizontal padding.
- Focus border: Violet, plus a visible focus ring.
- Placeholder: Muted Gray; never use placeholder as the only label.

### Navigation

- Transparent background.
- Wordmark left; concise product links centred or grouped; primary CTA right.
- Padding: `20px 40px` on desktop.
- Nav labels: Inter, `15px`, `400`, Muted Gray.
- Hover: Ink.
- On mobile, collapse to a hamburger below approximately `768px`; keep wordmark and primary CTA visible where space allows.

### Trust/proof row

The reference trust bar becomes an integrations/proof row:

```text
GITHUB     DEPENDABOT     TELEGRAPH     BASE SEPOLIA
```

Use grayscale marks or text labels. Do not imply endorsement, partnership or certification without permission and evidence. The row should recede behind the hero, not become a logo wall.

### Isometric Evidence Mesh

- Diamond tiles use glossy gradients from Tile Lavender through Tile Indigo.
- Node cards use Node Purple/Node Blue gradients with a soft top highlight.
- Connector lines use Connector Gray.
- Ambient shadow stays beneath the group.
- Keep the cluster legible as a sequence of evidence stages.
- Do not use generic person-avatar glyphs unless they identify an actual actor such as repository, Miner or maintainer.

### Glitch headline

- Apply to exactly one line: `THE THRESHOLD`.
- Use Violet core text with Glitch Cyan and a restrained indigo ghost offset.
- Use visible pixel quantization only at display size.
- Disable or reduce the effect for reduced-motion and accessibility modes.
- Do not animate continuously; a static effect is enough.

## Do's and Don'ts

### Do

- Keep White as the page field and the main card surface.
- Keep Inter as the sole expressive family.
- Keep the dot grid faint and hero-specific.
- Keep the primary gradient exclusive to the CTA and glitch line.
- Keep UI chrome shadow-free.
- Use the Evidence Mesh as a product-specific visual anchor.
- Put `PASS`, `HOLD` or `REVIEW` first on decision screens.
- Use IBM Plex Mono for evidence, not for long prose.
- Show GitHub facts and Telegraph facts as distinct sources.
- Keep the proof row muted and factual.
- Preserve enough whitespace for a calm, premium pace.
- Make the threshold line work in monochrome as a thin rule or connector.

### Don't

- Do not use the reference system’s name, copy, generic automation promise or category symbolism.
- Do not add a second display typeface.
- Do not apply glitch to the Limen wordmark, state labels, cards, body copy or buttons.
- Do not use the purple-to-indigo gradient as a page background or generic card fill.
- Do not add button or navigation drop shadows.
- Do not create a shield, lock, fortress, robot or glowing brain as the main visual.
- Do not turn the Evidence Mesh into anonymous blockchain links.
- Do not use a green check without the evidence and policy reason.
- Do not call a failed external lookup a pass.
- Do not present a provider result as proof of repository exploitability.
- Do not make every module a pill or identical card.
- Do not use trust logos to imply partnerships that have not been verified.
- Do not put essential state information inside the illustration only.

## Responsive Behavior

### Mobile: 375–599px

- Headline drops to approximately `28px`.
- Hero remains centred and stacked.
- Proof labels wrap to two rows.
- Evidence Mesh removes secondary connector lines first.
- Decision cards remain full width with `16px` internal padding where necessary.
- Keep the state, reason and next action above the fold where possible.

### Tablet: 600–1023px

- Headline approximately `36px`.
- Illustration scales proportionally.
- Evidence surface remains a single readable column.
- Avoid compressing evidence records into unreadable multi-column tables.

### Desktop: 1024px+

- Full `44px` hero headline.
- Full Evidence Mesh detail.
- Max-width `1200px` centred container.
- Evidence detail may introduce a secondary rail after the main decision and next action are visible.

### Reduced motion

- Do not continuously animate the glitch effect or Evidence Mesh.
- If motion is used, it should clarify request → evidence → decision order.
- Respect `prefers-reduced-motion` by using static gradients, static connectors and opacity-free transitions.

## Agent Prompt Guide

When implementing Limen from this system:

1. Keep the page background White (`#FFFFFF`) and the hero dot grid faint (`#E5E5EA`).
2. Use Inter everywhere except evidence values, which use IBM Plex Mono.
3. Keep the centred single-column landing hero.
4. Reserve the purple-to-indigo gradient for the primary CTA and the one glitch-treated line.
5. Apply the glitch only to `THE THRESHOLD` or another single, explicitly chosen headline line.
6. Keep UI chrome flat and shadow-free.
7. Use white outlined cards with `12px` radius and generous padding for evidence records.
8. Interpret the glossy isometric illustration as the Evidence Mesh: repository facts → Telegraph route → policy → decision → receipt.
9. Show `PASS`, `HOLD` and `REVIEW` as explicit text plus shape plus colour.
10. Never imply that a Telegraph response alone proves repository exploitability.
11. Keep the trust/proof row muted and never fabricate partner endorsement.
12. Make the decision and next action visible before decorative illustration.
13. Keep touch targets at least `44px` and validate focus/contrast states.
14. Avoid generic security imagery, neon cyberpunk styling, glassmorphism and dashboard clutter.
