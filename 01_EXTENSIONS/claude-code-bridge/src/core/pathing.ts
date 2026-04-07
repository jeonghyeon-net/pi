import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import crypto from "node:crypto";
import type { Scope } from "./types.js";

export function normalizePath(value: string): string {
	return value.replace(/\\/g, "/");
}

export function relativePosix(from: string, to: string): string {
	return normalizePath(relative(from, to));
}

export function sha(input: string): string {
	return crypto.createHash("sha1").update(input).digest("hex").slice(0, 12);
}

export function scopeLabel(scope: Scope): string {
	return scope === "user" ? "User" : scope === "local" ? "Local" : "Project";
}

export function isPathInside(root: string, target: string): boolean {
	const rel = relative(root, target);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function resolveImportPath(token: string, baseFile: string): string {
	if (token.startsWith("~/")) return join(process.env.HOME || "", token.slice(2));
	if (isAbsolute(token)) return token;
	return resolve(dirname(baseFile), token);
}

export function isImportAllowed(scope: Scope, ownerRoot: string, resolvedPath: string): boolean {
	return scope === "user" || isPathInside(ownerRoot, resolvedPath);
}
