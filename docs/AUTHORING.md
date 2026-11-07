# Authoring decks

This is the guide for writing a deck. Follow it and the deck will validate and render without any app changes. The machine-checked contract is [`schema/deck.schema.json`](../schema/deck.schema.json); `app/validate.py` applies it and adds the cross-reference checks listed in [Validation rules](#validation-rules).

> **Available element types:** `text`, `chart`, `control` and `steps`. Equations with term labels, figures, callouts, tables and code arrive in a later phase; the validator rejects unknown element types. Display equations work inside any rich text with `$$...$$`.

## Workflow

1. Create a folder `decks/<deck-id>/` with a `deck.json` inside. Put any images or data in `decks/<deck-id>/assets/`.
2. Write the deck following this guide.
3. Validate: `python app/validate.py <deck-id>`. It needs only Python (no PySide6). Fix every reported problem.
4. Preview with authoring checks: `python app/main.py --deck <deck-id> --dev`. A panel lists math errors and any slot whose content overflows; overflowing slots get a red outline. Press `R` to reload after editing. Where PySide6 isn't installed, `python app/main.py --browser --deck <deck-id> --dev` shows the same preview in a web browser.
5. Commit only the `decks/<deck-id>/` folder. Never change app code to make a deck work.

## File skeleton

```json
{
  "schemaVersion": 1,
  "id": "my-deck-id",
  "title": "Deck title",
  "subtitle": "Optional one-line subtitle",
  "subject": "Tribology",
  "tags": ["lubrication", "bearings"],
  "theme": "default",
  "glossary": {
    "viscosity": "A fluid's resistance to shear, written $\\mu$ (Pa·s)."
  },
  "variables": {
    "h": { "label": "Film thickness", "unit": "µm", "min": 1, "max": 20, "step": 0.5, "value": 5 }
  },
  "slides": [
    {
      "id": "intro",
      "layout": "title",
      "title": "Deck title",
      "subtitle": "What this deck explains",
      "elements": [
        { "type": "text", "slot": "body", "content": "Subject · one-line framing" }
      ],
      "notes": "Optional speaker notes."
    }
  ]
}
```

### Deck fields

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | yes | integer | Always `1` for now. |
| `id` | yes | string | Lowercase words joined by hyphens (`reynolds-equation-intro`). **Must equal the folder name.** |
| `title` | yes | rich text | Shown in the window title and every slide footer. |
| `subtitle` | no | string | For the library card (Phase 4). |
| `subject` | no | string | Broad field, e.g. `"Tribology"`. Used for library filters. |
| `author` | no | string | |
| `tags` | no | list of strings | No duplicates. |
| `theme` | no | string | Only `"default"`. |
| `glossary` | no | object | Term → rich-text definition. See [Glossary](#glossary). |
| `variables` | no | object | Name → variable. See [Variables](#variables). |
| `slides` | yes | list | At least one slide. |

No other top-level fields are allowed.

### Slide fields

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `id` | yes | string | Starts with a letter; letters, digits, `-`, `_`. Unique across all slide **and** element ids in the deck. |
| `layout` | yes | string | One of the [layouts](#layouts). |
| `title` | no | rich text | The slide heading. Almost every slide should have one. |
| `subtitle` | no | rich text | A line under the title. Best on `title` and `section-break` slides. |
| `elements` | no | list | Content, placed into the layout's slots. |
| `notes` | no | string | Speaker notes (plain text). |

### Element fields: `text`

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `type` | yes | `"text"` | |
| `slot` | yes | string | Must be a slot of the slide's layout. |
| `content` | yes | rich text with blocks | Paragraphs, lists, inline and display math. |
| `id` | no | string | Same rules as slide ids; unique in the deck. Give one to anything you may reference later. |
| `size` | no | `"small"` \| `"normal"` \| `"large"` | Default `normal` (34 px). `large` (44 px) for one-sentence leads; `small` (28 px, the minimum) only to fit dense content. |
| `align` | no | `"start"` \| `"center"` | Default `start`. |

No other element fields are allowed. Never add colors, fonts, sizes in pixels or positions: the theme controls all styling.

### Element fields: `control`

A slider (or on/off switch) bound to an **input** variable. Moving it updates every `{{name}}`, live equation and chart that reads the variable, on every slide. Two controls for the same variable stay in sync.

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `type` | yes | `"control"` | |
| `slot` | yes | string | Usually the `body` slot beside a chart. |
| `var` | yes | string | An input variable (one with `value`). A slider needs `min` and `max` on the variable; `step` sets its resolution and the decimals shown. |
| `kind` | no | `"slider"` \| `"toggle"` | Default `slider`. A toggle sets the variable to 1 (on) or 0 (off). |
| `label` | no | rich text | Defaults to the variable's `label`. |
| `on`, `off` | no | string | Toggle readouts. Default "On" / "Off". |
| `id` | no | string | |

The readout shows the value with the variable's `unit`. Double-clicking a slider resets it to the variable's `value`.

### Element fields: `chart`

Function plots (curves from expressions) and data plots (from a CSV file or inline columns), drawn with Plotly.js. Hover shows values; clicking a legend entry hides that series. Charts that read a variable redraw instantly when a slider moves.

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `type` | yes | `"chart"` | |
| `slot` | yes | string | `figure` in `body-figure` or `full-figure`, or one column of `two-column`. The chart fills the rest of the slot's height. |
| `kind` | yes | `"function"` \| `"line"` \| `"scatter"` \| `"bar"` | The default mark for each series: line, line, points, bars. |
| `x` | for expressions | name | What expressions are plotted against. If it is a slider variable, the domain defaults to its `min`..`max` and a dot marks its current value on each curve. Otherwise it is a free name (like `X` or `eta`) and you must give `domain`. |
| `expr` | one of `expr`/`series` | expression | Shorthand for a single curve. |
| `series` | one of `expr`/`series` | list | Each item is a function series `{"expr": ...}` or a data series `{"x": "<column>", "y": "<column>"}`, plus optional `name` (legend and hover; a legend appears when 2+ series are named), `mark` (`line`, `points`, `line+points`, `area`, `bar`), `role: "reference"` (dashed, muted: a comparison curve) and `axis: "right"` (plot against a second y-axis). |
| `domain` | sometimes | `[from, to]` | Range of `x` sampled for expressions. |
| `samples` | no | integer | Points per curve, default 200. |
| `data` | for data series | string or object | A CSV path in the deck folder (`"assets/results.csv"`), or inline columns `{"t": [0, 1, 2], "T": [20, 35, 41]}`. |
| `xLabel`, `yLabel`, `y2Label` | no | **plain text** | Axis titles, also used in hover. Plotly draws these, so no `$...$`: use Unicode (`μ`, `hₒ`, `−`). Include units: `"Film thickness h (µm)"`. `y2Label` is required when a series uses `axis: "right"`. |
| `xRange`, `yRange`, `y2Range` | no | `[from, to]` | Fixed axis ranges. **Set `yRange` on any chart that redraws live** so the axis doesn't jump while the slider moves. |
| `xScale`, `yScale` | no | `"linear"` \| `"log"` | Log axes need ranges above 0. |
| `transpose` | no | boolean | Puts `x` on the vertical axis (velocity profiles across a film, depth plots). `xLabel` still names the horizontal axis. |
| `track` | no | boolean | `false` hides the current-value dot. |
| `caption` | no | rich text | Shown under the chart; math and `{{name}}` work. |
| `id` | no | string | |

CSV files: first row is the column names, comma-separated, one row per point. Lines starting with `#` are comments (say how the data was made). Columns used for `x`/`y` must be numbers, except the `x` column of a bar series, which can be category names.

```json
{ "type": "chart", "slot": "figure", "kind": "function", "x": "h", "expr": "(5/h)^2",
  "xLabel": "Film thickness h (µm)", "yLabel": "Load relative to 5 µm", "yRange": [0, 26],
  "caption": "The dot follows the slider." }
```

### Element fields: `steps`

Content revealed one step at a time: derivations, build-ups, worked examples. Forward (→, click, Space, scroll down) reveals the next step before moving to the next slide; back hides the last step. Arriving from the next slide shows every step.

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `type` | yes | `"steps"` | |
| `slot` | yes | string | |
| `items` | yes | list of rich text with blocks | One per step. Each can hold a sentence and a `$$...$$` equation. |
| `initial` | no | integer | Steps visible on arrival. Default 1; `0` starts blank. |
| `numbered` | no | boolean | Default `true` (numbered circles). |
| `id` | no | string | |

Keep to 2 to 5 steps; space is reserved for hidden steps, so the slide must fit with all of them showing.

## Layouts

The canvas is a fixed 1920 × 1080. Each layout has named slots; elements go into the slot named by `slot`, stacked in the order they appear in `elements`.

| Layout | Slots | Use it for |
| --- | --- | --- |
| `title` | `body` | First slide. Large title, subtitle, a short line in `body`. |
| `section-break` | `body` | Start of a new part. Accent-colored background, large title, one sentence in `body`. |
| `title-body` | `body` | The default content slide: a heading and one column of text. |
| `two-column` | `left`, `right` | Comparisons, or a list next to its explanation. Equal widths. |
| `body-figure` | `body`, `figure` | Text and a slider beside a chart (figure slot is wider). The go-to layout for interactive slides. |
| `full-figure` | `figure` | One large visual with a heading. |
| `equation-focus` | `equation`, `body` | One key equation, centered and enlarged, with a short caption in `body`. Put the equation as `$$...$$` in a `text` element in the `equation` slot. |

## Rich text

Every text field marked *rich text* (deck title, slide title and subtitle, `text` content, `steps` items, chart captions, control and variable labels, glossary definitions) uses this inline markup:

| Markup | Renders as | Example |
| --- | --- | --- |
| `$...$` | Inline equation (KaTeX) | `$\\sigma = F/A$` |
| `$$...$$` | Display equation on its own line | `$$\\nabla \\cdot q = 0$$` |
| `**bold**` | Bold | `**key idea**` |
| `*italic*` | Italic | `*why it matters*` |
| `[[term]]` | Glossary hover card | `[[viscosity]]` |
| `[[term\|shown text]]` | Hover card with custom visible text | `[[viscosity\|thick fluid]]` |
| `{{name}}` | Live value of a deck variable; updates as sliders move. Works inside math too | `h = {{h}} µm`, `$q = {{qr}}\\,Uh$` |
| `^[note]` | Numbered footnote marker; hover shows the note (rich text) | `Petroff^[Published 1883.]` |
| `\$` `\*` `\[` `\]` `\{` `\}` `\^` `\\` | That literal character | `costs \\$5` |

Not available yet (later phases): `@ref(id)`.

### JSON escaping (most common mistake)

Deck files are JSON, so **every LaTeX backslash is written twice**: `\frac` is `"\\frac"`, `\mu` is `"\\mu"`, `\,` is `"\\,"`. A literal dollar sign in prose is `\$`, written `"\\$"` in JSON. A line break is `\n`, a blank line is `\n\n`.

### Blocks (paragraphs and lists)

In a `text` element's `content`:

- A blank line (`\n\n`) starts a new paragraph.
- A single newline (`\n`) inside a paragraph is a line break.
- A block whose lines start with `- ` is a bulleted list; `1. `, `2. ` is a numbered list. One item per line. A line without a marker continues the previous item.
- Nested lists aren't supported.
- `$$...$$` inside a paragraph renders as a centered display equation.

```json
"content": "Two flows add up:\n\n$$q = \\frac{U h}{2} - \\frac{h^3}{12\\mu}\\frac{dp}{dx}$$\n\n- Shear drags oil along.\n- Pressure pushes it back."
```

### Math

- KaTeX supports most LaTeX math: fractions, `\partial`, `\left( \right)`, `\underbrace{}_{}`, `\text{}`, `\dfrac`, Greek letters, `\cdot`, `\ll`, `\propto`, `\!` and `\;` spacing. For multi-line equations use `\begin{aligned} ... \end{aligned}` or `cases` inside `$$...$$`. Equation numbering and cross-references (`\label`, `\eqref`) are not supported.
- Put units outside math: `$h$ = 5 µm`, or inside with `\text{}`: `$h = 5\,\text{µm}$`.
- To tag an equation symbol for later hover features, `\htmlId{term-mu}{\mu}` is allowed.
- Bad LaTeX renders as red source text and is listed in the `--dev` panel. Always preview with `--dev`.

### Glossary

- Keys are the terms. They may contain spaces but not `[`, `]` or `|`.
- `[[term]]` lookup is case-insensitive: `[[Viscosity]]` finds `"viscosity"`. The card title shows the glossary key as written.
- Every `[[term]]` must have a glossary entry, or the deck fails validation.
- Definitions are rich text (math and emphasis work) but **may not contain `[[...]]`**.
- Keep definitions to one or two sentences. Define a term the first time it appears on a slide; you don't need to bracket every later use.

### Variables

Variables are what make a deck interactive: a `control` changes one, and every `{{name}}`, live equation and chart that reads it updates at once, on every slide.

- Names are simple identifiers: `h`, `film_thickness`. They are case-sensitive.
- An **input** variable has a `value` and, to get a slider, `min`, `max` and usually `step`. `min` must be below `max`, and `value` within them.
- A **derived** variable has an `expr` instead, computed from other variables: `"W": {"expr": "(5/h)^2"}`. It recomputes whenever its inputs change. Derived variables can't have `min`/`max`/`step` and can't depend on themselves.
- Optional on both: `label` (rich text; a control's default label), `unit` (shown in slider readouts), `digits` (decimal places when shown).
- Default display: inputs use as many decimals as `step`; derived values show 3 significant figures. Negative values get a proper minus sign.
- `{{name}}` shows the value. Write the unit yourself after it. Inside math, `$q = {{qr}}\\,Uh$` re-renders the equation with the current value.
- A chart whose `x` is a variable sweeps it and recomputes derived variables at every point, so `"x": "K", "expr": "W"` plots the derived `W` against `K`.

```json
"variables": {
  "h":    { "label": "Film thickness $h$", "unit": "µm", "min": 1, "max": 20, "step": 0.5, "value": 5 },
  "Wrel": { "label": "Load relative to 5 µm", "expr": "(5/h)^2" }
}
```

### Expressions

Used by derived variables and chart series. Never written in LaTeX.

- Numbers `2`, `0.5`, `1e-3`; names (deck variables, the chart's `x`); constants `pi`, `e`.
- Operators `+ - * /`, power `^` (or `**`), parentheses. `-x^2` means $-(x^2)$. **Always write multiplication**: `2*x`, not `2x`.
- Functions: `sin cos tan asin acos atan atan2 sinh cosh tanh exp ln log` (both natural log) `log10 log2 sqrt cbrt abs sign floor ceil round min max pow hypot`.
- Division by zero gives a gap in a curve, or "–" for a shown value. To keep a formula defined at a slider's end, clamp with a derived helper: `"Ks": {"expr": "max(K, 0.001)"}`.

## Validation rules

Beyond the JSON Schema, a deck fails if:

- `id` doesn't equal its folder name.
- Any slide or element id is used twice (slides and elements share one id space).
- An element's `slot` isn't one of its slide layout's slots.
- A `[[term]]` has no glossary entry, or a `[[` is never closed.
- A `[[term]]` appears inside a glossary definition.
- A `{{name}}` (in prose or math) refers to an undefined variable.
- A variable has both or neither of `value` and `expr`; an expression has a syntax error, uses an unknown name or function, or derived variables form a loop.
- A `control` names a missing or derived variable, or a slider's variable lacks `min`/`max`.
- A chart has expressions but no `x`, needs a `domain`, names a CSV that doesn't exist, or reads a column that isn't there (or isn't numeric).
- A range's first value isn't below its second, or a `steps` element's `initial` exceeds its items.
- A `$` or `$$` is never closed (use `\$` for a literal dollar sign).
- A variable's `min` ≥ `max`, or `value` falls outside them.
- `schemaVersion` is newer than the app understands.

## Writing good slides

- **One idea per slide.** The title states the idea as a phrase or claim ("Why film thickness matters"), not a topic label ("Film thickness").
- **Budget text.** Aim for 40 words or fewer per `title-body` slide, at most about 5 bullets, and about 3 to 4 bullets per column in `two-column`. At normal size a full-width slot holds roughly 12 lines; a column holds roughly 9 short lines. If `--dev` reports overflow, split the slide rather than shrinking text.
- **Lead with the result.** Use one `size: "large"` text element for the headline sentence, followed by a normal-size element with the supporting points.
- **Give equations room.** Use `equation-focus` for any equation the audience must study; keep its caption to one or two sentences.
- **Structure the deck:** `title` slide → for each part, an optional `section-break` → content slides → a closing `title-body` slide of numbered takeaways. 6 to 15 slides is typical.
- **Use hover cards for vocabulary**, footnotes for history or asides, and keep the main text readable without opening either.
- **Make it interactive where it teaches.** A slider earns its place when moving it reveals a relationship: a trend, a sign change, an optimum, a regime switch. Pair it with a chart that redraws and one live sentence that states the consequence ("At {{h}} µm the bearing carries **{{Wrel}}×** the load"). Good candidates: scaling laws, profiles that change shape, design trade-offs with a best value. Use `steps` for derivations the audience should follow line by line.
- **Charts tell one story each.** One to three series, axis labels with units, a fixed `yRange` on live charts, a one-line caption. Only plot real data or values computed from stated formulas; say in the caption or a CSV comment where data came from.
- An interactive `body-figure` slide holds about: a 1 to 3 line lead, one control, a 2 to 3 line live sentence. Move definitions into footnotes if it overflows.
- Write in plain, active sentences. Check facts and equations; the deck is teaching material.

## Complete example

See [`decks/reynolds-equation-intro/deck.json`](../decks/reynolds-equation-intro/deck.json): every layout, glossary terms, footnotes, inline, display and live math, input and derived variables, sliders shared across slides, function charts (tracking dot, transposed profile, area fill, right-hand axis, reference curve), a CSV data chart, and a `steps` derivation.

## Checklist before committing

- [ ] `python app/validate.py <deck-id>` prints `OK`.
- [ ] `python app/main.py --deck <deck-id> --dev` shows "No authoring warnings" (green panel).
- [ ] Every slide has a title, and no slot is outlined red.
- [ ] Only files under `decks/<deck-id>/` changed.
