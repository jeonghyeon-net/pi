import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleWidth } from "@mariozechner/pi-tui";
import { boxBot, boxRow, boxSep, boxTop, sColor, sIcon } from "../core/box.js";
import type { ServerStatus } from "../core/types.js";

// ━━━ Mock theme ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// A lightweight theme stub - fg/bold are identity functions so that the
// box helpers produce visually predictable plain-text output we can assert on.

interface ThemeStub {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

function plainTheme(): ThemeStub {
  return {
    fg: (_color, text) => text,
    bold: (text) => text,
  };
}

function taggedTheme(): ThemeStub {
  // Wraps text with <color>…</color> so tests can verify which colors are used.
  return {
    fg: (color, text) => `<${color}>${text}</${color}>`,
    bold: (text) => `[B]${text}[/B]`,
  };
}

// Cast helper (only used to satisfy the Theme parameter in tests — our stub
// exposes exactly the subset the box helpers use).
function asTheme(stub: ThemeStub): Parameters<typeof boxTop>[0] {
  return stub as unknown as Parameters<typeof boxTop>[0];
}

// ━━━ sColor ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("sColor", () => {
  it("returns success for connected", () => {
    assert.equal(sColor("connected"), "success");
  });

  it("returns error for error", () => {
    assert.equal(sColor("error"), "error");
  });

  it("returns warning for disconnected", () => {
    assert.equal(sColor("disconnected"), "warning");
  });

  it("returns muted for connecting", () => {
    assert.equal(sColor("connecting"), "muted");
  });

  it("returns muted for unknown status values (default branch)", () => {
    // Force the default branch with a synthetic status not in the union.
    const unknownStatus = "unknown" as ServerStatus;
    assert.equal(sColor(unknownStatus), "muted");
  });
});

// ━━━ sIcon ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("sIcon", () => {
  it("returns ● for connected", () => {
    assert.equal(sIcon("connected"), "●");
  });

  it("returns ✗ for error", () => {
    assert.equal(sIcon("error"), "✗");
  });

  it("returns ○ for disconnected", () => {
    assert.equal(sIcon("disconnected"), "○");
  });

  it("returns ◐ for connecting", () => {
    assert.equal(sIcon("connecting"), "◐");
  });

  it("returns ◐ for unknown status values (default branch)", () => {
    const unknownStatus = "unknown" as ServerStatus;
    assert.equal(sIcon(unknownStatus), "◐");
  });
});

// ━━━ boxTop ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("boxTop", () => {
  it("centers the title with horizontal borders at even widths", () => {
    const th = plainTheme();
    const out = boxTop(asTheme(th), "x", 9);
    // " x " takes 3 cols, remaining 6 cols split evenly → 3 left, 3 right
    assert.equal(out, "╭─── x ───╮");
    assert.equal(visibleWidth(out), 11); // 9 inner + 2 corners
  });

  it("pads one extra on the right when inner width - title width is odd", () => {
    const th = plainTheme();
    const out = boxTop(asTheme(th), "x", 8);
    // " x " = 3 cols, remaining 5 → Math.floor(5/2)=2 left, 3 right
    assert.equal(out, "╭── x ───╮");
  });

  it("applies theme colors: border for rails and accent+bold for the title", () => {
    const th = taggedTheme();
    const out = boxTop(asTheme(th), "hi", 10);
    assert.ok(out.includes("<border>"));
    assert.ok(out.includes("<accent>[B] hi [/B]</accent>"));
    assert.match(out, /<border>╭─+<\/border>/);
    assert.match(out, /<border>─+╮<\/border>/);
  });

  it("produces no padding when title width equals inner width", () => {
    const th = plainTheme();
    const out = boxTop(asTheme(th), "abc", 5); // " abc " = 5 cols, innerW=5
    assert.equal(out, "╭ abc ╮");
  });

  it("emits a minimal box border when title equals inner width (no dashes)", () => {
    const th = plainTheme();
    // title " x " = 3 cols, innerW=3 → p1=0, p2=0 → no dashes at all
    const out = boxTop(asTheme(th), "x", 3);
    assert.equal(out, "╭ x ╮");
  });
});

// ━━━ boxSep ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("boxSep", () => {
  it("produces a horizontal separator with T-junctions at each end", () => {
    const th = plainTheme();
    assert.equal(boxSep(asTheme(th), 5), "├─────┤");
  });

  it("wraps the full separator in a single border color span", () => {
    const th = taggedTheme();
    assert.equal(boxSep(asTheme(th), 3), "<border>├───┤</border>");
  });

  it("emits only the T-junctions when inner width is zero", () => {
    const th = plainTheme();
    assert.equal(boxSep(asTheme(th), 0), "├┤");
  });
});

// ━━━ boxBot ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("boxBot", () => {
  it("produces a horizontal closing with rounded corners", () => {
    const th = plainTheme();
    assert.equal(boxBot(asTheme(th), 4), "╰────╯");
  });

  it("wraps the bottom in a single border color span", () => {
    const th = taggedTheme();
    assert.equal(boxBot(asTheme(th), 2), "<border>╰──╯</border>");
  });
});

// ━━━ boxRow ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("boxRow", () => {
  it("wraps a leading space + content between vertical rails at the target width", () => {
    const th = plainTheme();
    const out = boxRow(asTheme(th), "hi", 5);
    // " " + content padded/truncated to width 5
    assert.equal(visibleWidth(out), 7); // 5 inner + 2 rails
    assert.ok(out.startsWith("│"));
    assert.ok(out.endsWith("│"));
    assert.ok(out.includes(" hi"));
  });

  it("truncates long content with an ellipsis", () => {
    const th = plainTheme();
    // innerW = 6, " " + "abcdefghij" = 11 cols → truncated to 6 visible cols
    const out = boxRow(asTheme(th), "abcdefghij", 6);
    assert.equal(visibleWidth(out), 8); // 6 inner + 2 rails
    // The … suffix is applied by truncateToWidth.
    assert.ok(out.includes("…"));
  });

  it("colors only the rails with the border color", () => {
    const th = taggedTheme();
    const out = boxRow(asTheme(th), "x", 4);
    // Rails colored, middle content untouched by the box layer.
    assert.ok(out.startsWith("<border>│</border>"));
    assert.ok(out.endsWith("<border>│</border>"));
  });

  it("pads content with trailing spaces when shorter than innerW", () => {
    const th = plainTheme();
    const out = boxRow(asTheme(th), "a", 6);
    assert.equal(visibleWidth(out), 8);
    // Middle between rails should be " a" + 4 spaces.
    assert.equal(out, "│ a    │");
  });
});
