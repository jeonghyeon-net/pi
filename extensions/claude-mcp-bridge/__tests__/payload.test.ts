import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it } from "node:test";
import { LARGE_PAYLOAD_PREVIEW_CHARS, LARGE_PAYLOAD_THRESHOLD_CHARS } from "../core/constants.js";
import {
  buildMcpToolResultContent,
  formatToolResult,
  preparePayloadForClient,
} from "../core/payload.js";
import type { FormattedToolResult, PreparedPayload } from "../core/types.js";

// Track temp files created during tests so we can clean them up
const createdPaths: string[] = [];

function trackTmpFiles(base: string): void {
  // After a test writes a file to os.tmpdir(), we record it so we can unlink it.
  createdPaths.push(base);
}

afterEach(() => {
  // Scan os.tmpdir() for any files created by these tests and remove them.
  const entries = fs.readdirSync(os.tmpdir());
  for (const entry of entries) {
    if (
      entry.startsWith("mcp-payload-") ||
      entry.startsWith("mcp-image-") ||
      entry.startsWith("mcp-bridge-readonly-")
    ) {
      try {
        fs.unlinkSync(path.join(os.tmpdir(), entry));
      } catch {
        // ignore
      }
    }
  }
});

after(() => {
  for (const p of createdPaths) {
    try {
      fs.unlinkSync(p);
    } catch {
      // ignore
    }
  }
});

// ━━━ preparePayloadForClient ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("preparePayloadForClient", () => {
  it("returns input unchanged when under threshold", () => {
    const text = "short content";
    const result = preparePayloadForClient(text, "server", "tool");
    assert.equal(result.truncated, false);
    assert.equal(result.text, text);
    assert.equal(result.originalLength, text.length);
    assert.equal(result.fullPayloadPath, undefined);
  });

  it("returns input unchanged when exactly at threshold", () => {
    const text = "x".repeat(LARGE_PAYLOAD_THRESHOLD_CHARS);
    const result = preparePayloadForClient(text, "server", "tool");
    assert.equal(result.truncated, false);
    assert.equal(result.originalLength, LARGE_PAYLOAD_THRESHOLD_CHARS);
  });

  it("writes large payload to tmp file and returns truncated message", () => {
    const text = "a".repeat(LARGE_PAYLOAD_THRESHOLD_CHARS + 100);
    const result = preparePayloadForClient(text, "myServer", "myTool");
    assert.equal(result.truncated, true);
    assert.ok(result.fullPayloadPath);
    assert.equal(result.originalLength, LARGE_PAYLOAD_THRESHOLD_CHARS + 100);

    // Returned text should include the preview
    assert.ok(result.text.startsWith("a".repeat(LARGE_PAYLOAD_PREVIEW_CHARS)));
    // Should mention truncation
    assert.match(result.text, /Truncated output/);
    assert.match(result.text, /Full payload saved to/);
    assert.match(result.text, /Use Read tool/);

    // File should contain full payload
    const saved = fs.readFileSync(result.fullPayloadPath as string, "utf-8");
    assert.equal(saved, text);

    // Filename should contain sanitized server/tool names
    const basename = path.basename(result.fullPayloadPath as string);
    assert.match(basename, /^mcp-payload-myserver-mytool-\d+-[a-z0-9]+\.txt$/);
    trackTmpFiles(result.fullPayloadPath as string);
  });

  it("uses fallback names when server/tool sanitize to empty", () => {
    const text = "b".repeat(LARGE_PAYLOAD_THRESHOLD_CHARS + 50);
    const result = preparePayloadForClient(text, "!!!", "???");
    assert.equal(result.truncated, true);
    assert.ok(result.fullPayloadPath);
    const basename = path.basename(result.fullPayloadPath as string);
    assert.match(basename, /^mcp-payload-server-tool-\d+-[a-z0-9]+\.txt$/);
    trackTmpFiles(result.fullPayloadPath as string);
  });

  it("returns error message when file write fails", () => {
    const text = "c".repeat(LARGE_PAYLOAD_THRESHOLD_CHARS + 10);
    const original = fs.writeFileSync;
    const mocked = ((target: unknown, data: unknown, options: unknown): void => {
      if (typeof target === "string" && target.includes("mcp-payload-")) {
        throw new Error("disk full");
      }
      (original as (t: unknown, d: unknown, o: unknown) => void)(target, data, options);
    }) as unknown as typeof fs.writeFileSync;
    (fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = mocked;

    try {
      const result = preparePayloadForClient(text, "server", "tool");
      assert.equal(result.truncated, true);
      assert.equal(result.fullPayloadPath, undefined);
      assert.match(result.text, /Failed to save full payload/);
      assert.match(result.text, /disk full/);
      assert.match(result.text, /Truncated output/);
    } finally {
      (fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = original;
    }
  });

  it("returns stringified non-Error when write throws non-Error", () => {
    const text = "d".repeat(LARGE_PAYLOAD_THRESHOLD_CHARS + 10);
    const original = fs.writeFileSync;
    const mocked = ((target: unknown, data: unknown, options: unknown): void => {
      if (typeof target === "string" && target.includes("mcp-payload-")) {
        throw "string-error";
      }
      (original as (t: unknown, d: unknown, o: unknown) => void)(target, data, options);
    }) as unknown as typeof fs.writeFileSync;
    (fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = mocked;

    try {
      const result = preparePayloadForClient(text, "server", "tool");
      assert.equal(result.truncated, true);
      assert.match(result.text, /string-error/);
    } finally {
      (fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = original;
    }
  });
});

// ━━━ formatToolResult ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatToolResult", () => {
  it("returns string as-is", () => {
    const result = formatToolResult("hello world");
    assert.equal(result.text, "hello world");
    assert.deepEqual(result.imagePaths, []);
  });

  it("extracts text from content array", () => {
    const result = formatToolResult({
      content: [
        { type: "text", text: "hello" },
        { type: "text", text: "world" },
      ],
    });
    assert.equal(result.text, "hello\nworld");
    assert.deepEqual(result.imagePaths, []);
  });

  it("handles text item with missing text field", () => {
    const result = formatToolResult({
      content: [{ type: "text" }, { type: "text", text: "hi" }],
    });
    // Empty strings filtered, only "hi" remains
    assert.equal(result.text, "hi");
  });

  it("writes image content to tmp file", () => {
    const pixel =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
    const result = formatToolResult({
      content: [
        {
          type: "image",
          data: pixel,
          mimeType: "image/png",
        },
      ],
    });
    assert.equal(result.imagePaths.length, 1);
    assert.ok(result.text.includes("Image saved:"));
    const imgPath = result.imagePaths[0];
    assert.ok(imgPath);
    assert.ok(fs.existsSync(imgPath));
    assert.match(path.basename(imgPath), /^mcp-image-\d+-[a-z0-9]+\.png$/);
    trackTmpFiles(imgPath);
  });

  it("maps image mime types to proper extensions", () => {
    const data = "Zm9vYmFy"; // "foobar" in base64
    const types: [string, string][] = [
      ["image/jpeg", "jpg"],
      ["image/gif", "gif"],
      ["image/webp", "webp"],
      ["image/svg+xml", "svg"],
      ["image/png", "png"],
      ["image/unknown", "png"],
    ];
    for (const [mime, ext] of types) {
      const result = formatToolResult({
        content: [{ type: "image", data, mimeType: mime }],
      });
      assert.equal(result.imagePaths.length, 1);
      const imgPath = result.imagePaths[0];
      assert.ok(imgPath);
      assert.ok(imgPath.endsWith(`.${ext}`), `${mime} should become .${ext}`);
      trackTmpFiles(imgPath);
    }
  });

  it("uses default png extension when image has no mimeType", () => {
    const result = formatToolResult({
      content: [{ type: "image", data: "Zm9v" }],
    });
    assert.equal(result.imagePaths.length, 1);
    const imgPath = result.imagePaths[0];
    assert.ok(imgPath);
    assert.ok(imgPath.endsWith(".png"));
    trackTmpFiles(imgPath);
  });

  it("renders image item without data as JSON stringified", () => {
    const result = formatToolResult({
      content: [{ type: "image", mimeType: "image/png" }],
    });
    // No data -> item is not recognized as valid image; falls through to JSON.stringify
    assert.equal(result.imagePaths.length, 0);
    assert.match(result.text, /"type":"image"/);
  });

  it("handles image item whose data flips to falsy after initial check", () => {
    // Use a getter so renderContentItem sees data truthy, then writeImageToTmp
    // re-reads data and gets a falsy value, hitting the defensive !item.data branch.
    let reads = 0;
    const item = {
      type: "image" as const,
      mimeType: "image/png",
      get data(): string {
        reads++;
        return reads === 1 ? "Zm9v" : "";
      },
    };
    const result = formatToolResult({ content: [item] });
    // writeImageToTmp returns JSON.stringify(item) when data becomes falsy
    assert.equal(result.imagePaths.length, 0);
    assert.match(result.text, /"type":"image"/);
  });

  it("returns save-failed message when image write throws", () => {
    const original = fs.writeFileSync;
    const mocked = ((target: unknown, data: unknown, options: unknown): void => {
      if (typeof target === "string" && target.includes("mcp-image-")) {
        throw new Error("nope");
      }
      (original as (t: unknown, d: unknown, o: unknown) => void)(target, data, options);
    }) as unknown as typeof fs.writeFileSync;
    (fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = mocked;

    try {
      const result = formatToolResult({
        content: [{ type: "image", data: "Zm9v", mimeType: "image/png" }],
      });
      assert.equal(result.imagePaths.length, 0);
      assert.match(result.text, /Image save failed/);
      assert.match(result.text, /image\/png/);
    } finally {
      (fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = original;
    }
  });

  it("stringifies unknown content item types", () => {
    const result = formatToolResult({
      content: [{ type: "weird", data: "stuff" } as unknown as { type: string }],
    });
    assert.match(result.text, /"type":"weird"/);
  });

  it("falls back to structuredContent when content array empty", () => {
    const result = formatToolResult({
      content: [],
      structuredContent: { foo: "bar" },
    });
    assert.equal(result.text, JSON.stringify({ foo: "bar" }, null, 2));
  });

  it("falls back to structuredContent when content missing", () => {
    const result = formatToolResult({ structuredContent: [1, 2, 3] });
    assert.equal(result.text, JSON.stringify([1, 2, 3], null, 2));
  });

  it("falls back to JSON.stringify when no content or structuredContent", () => {
    const result = formatToolResult({ random: "data" });
    assert.equal(result.text, JSON.stringify({ random: "data" }, null, 2));
  });

  it("handles null result by stringifying", () => {
    const result = formatToolResult(null);
    assert.equal(result.text, JSON.stringify(null, null, 2));
  });

  it("handles undefined result by stringifying", () => {
    const result = formatToolResult(undefined);
    // JSON.stringify(undefined) returns undefined
    assert.equal(result.text, undefined as unknown as string);
  });

  it("handles number result", () => {
    const result = formatToolResult(42);
    assert.equal(result.text, "42");
  });

  it("filters out empty chunks from content array", () => {
    // All text items empty -> chunks array empty -> fall through to structuredContent or JSON
    const result = formatToolResult({
      content: [{ type: "text", text: "" }, { type: "text" }],
      structuredContent: { fallback: true },
    });
    // chunks length is 0, so falls through to structuredContent
    assert.equal(result.text, JSON.stringify({ fallback: true }, null, 2));
  });
});

// ━━━ buildMcpToolResultContent ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildMcpToolResultContent", () => {
  it("returns single text item when no images and no truncation", () => {
    const formatted: FormattedToolResult = { text: "result", imagePaths: [] };
    const prepared: PreparedPayload = {
      text: "result",
      truncated: false,
      originalLength: 6,
    };
    const content = buildMcpToolResultContent(formatted, prepared);
    assert.equal(content.length, 1);
    assert.deepEqual(content[0], { type: "text", text: "result" });
  });

  it("includes image path hints for each image", () => {
    const formatted: FormattedToolResult = {
      text: "some text",
      imagePaths: ["/tmp/a.png", "/tmp/b.jpg"],
    };
    const prepared: PreparedPayload = {
      text: "some text",
      truncated: false,
      originalLength: 9,
    };
    const content = buildMcpToolResultContent(formatted, prepared);
    assert.equal(content.length, 3);
    const [c0, c1, c2] = content;
    assert.ok(c0 && c1 && c2);
    assert.equal(c0.text, "some text");
    assert.match(c1.text, /Use Read tool to view: \/tmp\/a\.png/);
    assert.match(c2.text, /Use Read tool to view: \/tmp\/b\.jpg/);
  });

  it("includes full payload path hint when truncated", () => {
    const formatted: FormattedToolResult = { text: "x", imagePaths: [] };
    const prepared: PreparedPayload = {
      text: "preview",
      truncated: true,
      fullPayloadPath: "/tmp/full.txt",
      originalLength: 1_000_000,
    };
    const content = buildMcpToolResultContent(formatted, prepared);
    assert.equal(content.length, 2);
    const [c0, c1] = content;
    assert.ok(c0 && c1);
    assert.equal(c0.text, "preview");
    assert.match(c1.text, /Full payload file: \/tmp\/full\.txt/);
  });

  it("combines image hints and payload path hint", () => {
    const formatted: FormattedToolResult = {
      text: "x",
      imagePaths: ["/tmp/img.png"],
    };
    const prepared: PreparedPayload = {
      text: "preview",
      truncated: true,
      fullPayloadPath: "/tmp/full.txt",
      originalLength: 99,
    };
    const content = buildMcpToolResultContent(formatted, prepared);
    assert.equal(content.length, 3);
    const [, c1, c2] = content;
    assert.ok(c1 && c2);
    assert.match(c1.text, /img\.png/);
    assert.match(c2.text, /full\.txt/);
  });

  it("skips payload path hint when truncated but no fullPayloadPath", () => {
    const formatted: FormattedToolResult = { text: "x", imagePaths: [] };
    const prepared: PreparedPayload = {
      text: "preview",
      truncated: true,
      originalLength: 99,
    };
    const content = buildMcpToolResultContent(formatted, prepared);
    assert.equal(content.length, 1);
  });
});
