import type { Api, Model } from "@mariozechner/pi-ai";

export const MAX_SECTION_LENGTH = 240;
export const MAX_TRANSCRIPT_LENGTH = 12000;
export const OVERVIEW_PROMPT = [
	"You maintain coding-session overviews.",
	"Treat the previous summary as the baseline state for the session.",
	"Carry forward still-relevant context unless recent updates clearly resolve or replace it.",
	"Do not overwrite the whole summary with only the latest turn.",
	"Write this as a quick reference for a user resuming the session later.",
	"Prioritize durable context: the current goal, important decisions, meaningful progress, blockers, and the next important step.",
	"Ignore routine greetings, acknowledgements, branch-name checks, shell state, raw tool chatter, toy/demo exchanges, and the fact that the assistant replied unless they materially change the task.",
	"If the recent updates contain no durable change, keep the previous title and summary unchanged.",
	"Return exactly this format:",
	"TITLE: <short title in the user's language, max 8 words, naming the durable task rather than chatty or incidental details>",
	"SUMMARY:",
	"- <short durable point in the user's language>",
	"Use 2-5 short `- ` bullets when durable state exists. One bullet per durable point.",
	"Make the user's current request or goal obvious from TITLE and SUMMARY.",
	"If TITLE already names that request clearly, first bullet should add non-duplicate state instead of restating it.",
	"Keep bullets concrete and scannable, not chatty.",
	"Describe current state rather than retelling events in chronological order.",
	"Keep the summary self-compacting: when it starts to sprawl, rewrite older still-relevant context more densely instead of letting the text grow turn after turn.",
	"Do not drop still-relevant context merely to make the summary shorter.",
	"Do not use numbered lists, code fences, or extra sections.",
].join(" ");

export type SessionOverviewModel = Model<Api>;
export type SessionOverviewAuth = { ok: true; apiKey?: string; headers?: Record<string, string> } | { ok: false; error: string };
export interface SessionOverviewModelRegistry { getApiKeyAndHeaders(model: SessionOverviewModel): Promise<SessionOverviewAuth>; }
export interface ResolveSessionOverviewOptions { recentText: string; previous?: { title: string; summary: readonly string[] }; model: SessionOverviewModel | undefined; modelRegistry: SessionOverviewModelRegistry; }
