import type { ServerEntry } from "./types-config.js";

type NotifyFn = (msg: string, type?: "info" | "warning" | "error") => void;
type Config = { mcpServers: Record<string, ServerEntry> };

export function handleAuth(
	name: string, cfg: Config, oauthDir: string, notify: NotifyFn,
): void {
	const entry = cfg.mcpServers[name];
	if (!entry) {
		notify(`Server "${name}" not found in config.`, "error");
		return;
	}
	if (entry.auth === "oauth") {
		showOAuthInstructions(name, oauthDir, notify);
		return;
	}
	if (entry.auth === "bearer") {
		showBearerInstructions(name, entry, notify);
		return;
	}
	notify(`Server "${name}" is not configured for OAuth or bearer auth.`, "error");
}

function showOAuthInstructions(
	name: string, oauthDir: string, notify: NotifyFn,
): void {
	const tokenPath = `${oauthDir}/${name}/tokens.json`;
	const msg = [
		`OAuth setup for "${name}":`,
		"",
		"1. Complete the OAuth flow for this server",
		`2. Place token file at: ${tokenPath}`,
		"",
		"Token file format: { \"access_token\": \"...\", \"token_type\": \"bearer\" }",
		"Optional: \"expiresAt\" (epoch ms) for expiry checking",
	].join("\n");
	notify(msg, "info");
}

function showBearerInstructions(
	name: string, entry: ServerEntry, notify: NotifyFn,
): void {
	const source = entry.bearerTokenEnv
		? `Set env var: ${entry.bearerTokenEnv}`
		: "Token set via bearerToken field in config";
	const msg = [
		`Auth for "${name}" uses bearer token.`,
		"",
		source,
	].join("\n");
	notify(msg, "info");
}
