import { extname } from "node:path";
import type { ReviewFileKind } from "../src/types.js";

const imageTypes = new Map(Object.entries({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp", ".ico": "image/x-icon" }));
const binaryExts = new Set([".pdf", ".zip", ".gz", ".tar", ".7z", ".bin", ".exe", ".dll", ".so"]);

export function detectFileKind(path: string): { kind: ReviewFileKind; mimeType: string | null } {
	const ext = extname(path).toLowerCase();
	const image = imageTypes.get(ext);
	if (image) return { kind: "image", mimeType: image };
	if (binaryExts.has(ext)) return { kind: "binary", mimeType: null };
	return { kind: "text", mimeType: null };
}
