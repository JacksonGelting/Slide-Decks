# Authoring decks

This is the guide for writing a deck. Follow it and the deck will validate and render without any app changes. The machine-checked contract is [`schema/deck.schema.json`](../schema/deck.schema.json); `app/loader.py` adds the cross-reference checks listed in [Validation rules](#validation-rules).

> **Phase 1 scope.** The only element type available today is `text`. Charts, equations with term labels, figures, callouts, tables, controls, steps and code arrive in later phases. Don't use them yet: the validator rejects unknown element types. Display equations work today inside `text` with `$$...$$`.

## Workflow

1. Create a folder `decks/<deck-id>/` with a `deck.json` inside. Put any images or data in `decks/<deck-id>/assets/`.
2. Write the deck following this guide.
3. Validate: `python app/main.py --validate --deck <deck-id>`. Fix every reported problem.
4. Preview with authoring checks: `python app/main.py --deck <deck-id> --dev`. A panel lists math errors and any slot whose content overflows; overflowing slots get a red outline. Press `R` to reload after editing.
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

## Layouts

The canvas is a fixed 1920 × 1080. Each layout has named slots; elements go into the slot named by `slot`, stacked in the order they appear in `elements`.

| Layout | Slots | Use it for |
| --- | --- | --- |
| `title` | `body` | First slide. Large title, subtitle, a short line in `body`. |
| `section-break` | `body` | Start of a new part. Accent-colored background, large title, one sentence in `body`. |
| `title-body` | `body` | The default content slide: a heading and one column of text. |
| `two-column` | `left`, `right` | Comparisons, or a list next to its explanation. Equal widths. |
| `body-figure` | `body`, `figure` | Text beside a figure or chart (figure slot is wider). In Phase 1 the `figure` slot can hold `text`, e.g. a display equation. |
| `full-figure` | `figure` | One large visual with a heading. |
| `equation-focus` | `equation`, `body` | One key equation, centered and enlarged, with a short caption in `body`. Put the equation as `$$...$$` in a `text` element in the `equation` slot. |

## Rich text

Every text field marked *rich text* (deck title, slide title and subtitle, element `content`, glossary definitions) uses this inline markup:

| Markup | Renders as | Example |
| --- | --- | --- |
| `$...$` | Inline equation (KaTeX) | `$\\sigma = F/A$` |
| `$$...$$` | Display equation on its own line | `$$\\nabla \\cdot q = 0$$` |
| `**bold**` | Bold | `**key idea**` |
| `*italic*` | Italic | `*why it matters*` |
| `[[term]]` | Glossary hover card | `[[viscosity]]` |
| `[[term\|shown text]]` | Hover card with custom visible text | `[[viscosity\|thick fluid]]` |
| `{{name}}` | Current value of a deck variable | `h = {{h}} µm` |
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

- Names are simple identifiers: `h`, `film_thickness`.
- Fields: `value` (required number), and optional `label`, `unit`, `min`, `max`, `step`. `min` must be below `max`, and `value` must be within them.
- `{{name}}` shows the value. Write the unit yourself after it. In Phase 1 the value is static; sliders that change it come in Phase 3.

## Validation rules

Beyond the JSON Schema, a deck fails if:

- `id` doesn't equal its folder name.
- Any slide or element id is used twice (slides and elements share one id space).
- An element's `slot` isn't one of its slide layout's slots.
- A `[[term]]` has no glossary entry, or a `[[` is never closed.
- A `[[term]]` appears inside a glossary definition.
- A `{{name}}` refers to an undefined variable.
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
- Write in plain, active sentences. Check facts and equations; the deck is teaching material.

## Complete example

See [`decks/reynolds-equation-intro/deck.json`](../decks/reynolds-equation-intro/deck.json): title, section-break, title-body, two-column and equation-focus layouts, glossary terms, a variable, a footnote, inline and display math.

## Checklist before committing

- [ ] `python app/main.py --validate --deck <deck-id>` prints `OK`.
- [ ] `python app/main.py --deck <deck-id> --dev` shows "No authoring warnings" (green panel).
- [ ] Every slide has a title, and no slot is outlined red.
- [ ] Only files under `decks/<deck-id>/` changed.
