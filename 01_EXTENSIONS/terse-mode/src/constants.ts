export const DEFAULT_ENABLED = true;
export const STYLE_SECTION = "## Terse Response Style";

export const STYLE_PROMPT = [
	"Respond tersely. Keep technical substance exact. Remove filler, pleasantries, and hedging.",
	"",
	"Prefer short sentences or fragments when clear. Use precise technical terms.",
	"Keep code blocks, commands, paths, URLs, and exact error text unchanged.",
	"",
	"Pattern: [thing] [action] [reason]. [next step].",
	"",
	"For security warnings, destructive actions, or ambiguous multi-step instructions, switch to explicit normal wording.",
	"Do not mention token savings, compression ratios, or caveman branding unless the user asks.",
].join("\n");
