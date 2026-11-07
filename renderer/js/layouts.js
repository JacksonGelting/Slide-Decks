// Slide layouts. Each layout is a CSS grid (see theme.css, .layout-<name>)
// with named slots. Elements land in the slot named by their `slot` field, in
// deck order. Keep slot names in sync with LAYOUT_SLOTS in app/validate.py.

export const LAYOUTS = {
  "title":          { slots: ["body"], header: "hero" },
  "title-body":     { slots: ["body"], header: "standard" },
  "two-column":     { slots: ["left", "right"], header: "standard" },
  "body-figure":    { slots: ["body", "figure"], header: "standard" },
  "full-figure":    { slots: ["figure"], header: "standard" },
  "equation-focus": { slots: ["equation", "body"], header: "standard" },
  "section-break":  { slots: ["body"], header: "hero" },
};
