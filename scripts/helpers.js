// scripts/helpers.js — Handlebars helpers for Kingdom Manager

export function registerHelpers() {
  Handlebars.registerHelper("unitTypeIcon", (type) => {
    const icons = {
      army:       "ti-shield",
      assassin:   "ti-skull",
      bodyguard:  "ti-shield-half",
      diplomat:   "ti-building-community",
      garrison:   "ti-tower",
      merchant:   "ti-coin",
      prophet:    "ti-eye",
      sage:       "ti-book",
      spy:        "ti-spy",
      warden:     "ti-trees",
    };
    return icons[type] ?? "ti-sword";
  });

  // Math helpers
  Handlebars.registerHelper("add",   (...args) => args.slice(0,-1).reduce((s,v) => s + (Number(v)||0), 0));
  Handlebars.registerHelper("sub",   (a, b) => a - b);
  Handlebars.registerHelper("mul",   (a, b) => a * b);
  Handlebars.registerHelper("div",   (a, b) => b !== 0 ? a / b : 0);
  Handlebars.registerHelper("abs",   (a)    => Math.abs(a));
  Handlebars.registerHelper("round", (a)    => Math.round(a));
  Handlebars.registerHelper("min",   (a, b) => Math.min(a, b));
  Handlebars.registerHelper("max",   (a, b) => Math.max(a, b));
  Handlebars.registerHelper("lt",    (a, b) => a < b);
  Handlebars.registerHelper("gt",    (a, b) => a > b);
  Handlebars.registerHelper("ne",    (a, b) => a !== b);
  Handlebars.registerHelper("eq",    (a, b) => a === b);
  Handlebars.registerHelper("or",    (a, b) => a || b);
  Handlebars.registerHelper("nullish", (a, b) => a ?? b);

  // String helpers
  Handlebars.registerHelper("capitalize", str =>
    str ? str.charAt(0).toUpperCase() + str.slice(1) : "");

  // Iterate over a literal array in templates
  Handlebars.registerHelper("array", (...args) => args.slice(0, -1));

  // Build stat pills array from a stats object
  // Returns [{ label, cssClass }] for non-zero stats
  Handlebars.registerHelper("statPills", (stats) => {
    if (!stats) return [];
    const map = {
      military: { label: "Mil", pos: "km-pill-mil", neg: "km-pill-neg" },
      wealth:   { label: "Wea", pos: "km-pill-wea", neg: "km-pill-neg" },
      social:   { label: "Soc", pos: "km-pill-soc", neg: "km-pill-neg" },
      magic:    { label: "Mag", pos: "km-pill-mag", neg: "km-pill-neg" },
    };
    return Object.entries(stats)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([stat, val]) => {
        const m = map[stat] ?? { label: stat, pos: "km-pill-generic", neg: "km-pill-neg" };
        const sign = val > 0 ? "+" : val < 0 ? "-" : "";
        return {
          label:    `${m.label} ${sign}${Math.abs(val)}`,
          cssClass: val >= 0 ? m.pos : m.neg,
        };
      });
  });

  // Return list of stat keys where headroom < 0
  Handlebars.registerHelper("overrunStats", (headroom) => {
    if (!headroom) return [];
    return Object.entries(headroom)
      .filter(([, v]) => v < 0)
      .map(([k]) => k);
  });

  // Check if all build checks are passed
  Handlebars.registerHelper("allPassed", (checks) => {
    if (!checks?.length) return false;
    return checks.every(c => c.passed);
  });

  // Parse a log entry string like "[T4] some text" into { tag, text, resultClass }
  Handlebars.registerHelper("parseTurnTag", (entry) => {
    const match = entry.match(/^\[T(\d+)\]\s*(.*)/);
    if (match) {
      const text = match[2];
      let resultClass = "";
      if (/passed/i.test(text)) resultClass = "km-log-pass";
      if (/failed/i.test(text)) resultClass = "km-log-fail";
      return { tag: `T${match[1]}`, text, resultClass };
    }
    return { tag: "—", text: entry, resultClass: "" };
  });

  // Reverse index helper for log (log is reversed for display, so index needs inverting)
  Handlebars.registerHelper("reverseIndex", (idx, len) => len - 1 - idx);
}
