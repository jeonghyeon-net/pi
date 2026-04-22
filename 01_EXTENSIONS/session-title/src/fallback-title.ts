import { looksLikePromptCopy, normalizeTitle } from "./title-format.js";

function sanitizeRequestText(text: string): string {
	return text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gu, "$1").replace(/https?:\/\/\S+/gu, " ").replace(/`([^`]+)`/gu, "$1").replace(/[>#*_~]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function stripRequestFraming(text: string): string {
	return text.replace(/^(docs|documentation|readme)\s+/iu, "").replace(/^(please|can you|could you|would you|help me|i need you to)\s+/iu, "").replace(/^(이거\s*참고해서|이거|좀|혹시)\s+/u, "").replace(/\s*(작업해줘|구현해줘|만들어줘|해주세요|해줘|부탁해|부탁합니다)$/u, "").trim();
}

function stripLogistics(text: string): string {
	return text.replace(/(?:^|\s)(다 만들고\s*)?(커밋|푸시|commit|push|typecheck|test|build).*/iu, "").replace(/(?:^|\s)(extensions?에 만들면 됨|extensions?에 넣어줘).*/iu, "").trim();
}

function condenseActionPhrase(text: string): string {
	const english = text.match(/^(add|fix|update|implement|create|make|write|refactor|remove|support|improve|enable|simplify|document|rename|move|review|debug|test|investigate|convert|build|ship)\s+(.+)/iu);
	return english?.[2]?.trim() || text;
}

function summarizeHowToPrompt(text: string): string {
	const trimmed = stripRequestFraming(text).replace(/[?？]+$/gu, "").trim();
	if (!trimmed) return "";
	const koreanRules = [
		{ pattern: /\s*(?:쓰려면|사용하려면)(?:\s*어떻게\s*(?:해야(?:함|해|하나|하나요|하냐|할까)?|함)|\s*방법)?\s*$/u, suffix: "사용 방법" },
		{ pattern: /\s*(?:설정하려면|설정은?)(?:\s*어떻게\s*(?:해야(?:함|해|하나|하나요|하냐|할까)?|함)|\s*방법)?\s*$/u, suffix: "설정 방법" },
		{ pattern: /\s*(?:설치하려면|깔려면)(?:\s*어떻게\s*(?:해야(?:함|해|하나|하나요|하냐|할까)?|함)|\s*방법)?\s*$/u, suffix: "설치 방법" },
		{ pattern: /\s*(?:연결하려면)(?:\s*어떻게\s*(?:해야(?:함|해|하나|하나요|하냐|할까)?|함)|\s*방법)?\s*$/u, suffix: "연결 방법" },
	];
	for (const { pattern, suffix } of koreanRules) {
		if (pattern.test(trimmed)) return normalizeTitle(trimmed.replace(pattern, ` ${suffix}`));
	}
	const englishRules = [
		{ pattern: /^(?:how (?:do|can) i\s+|how to\s+)(use\s+.+)$/iu, prefix: "" },
		{ pattern: /^(?:how (?:do|can) i\s+|how to\s+)(configure\s+.+)$/iu, prefix: "" },
		{ pattern: /^(?:how (?:do|can) i\s+|how to\s+)(install\s+.+)$/iu, prefix: "" },
		{ pattern: /^(?:how (?:do|can) i\s+|how to\s+)(connect\s+.+)$/iu, prefix: "" },
	];
	for (const { pattern, prefix } of englishRules) {
		const match = trimmed.match(pattern);
		if (match?.[1]) return normalizeTitle(`${prefix}${match[1]}`.trim());
	}
	const genericQuestion = trimmed
		.replace(/\s*(?:어떻게\s*(?:해야(?:함|해|하나|하나요|하냐|할까)?|함)|방법|가능(?:함|해|한가|할까)?|되나|됨|돼|되냐|될까|뭐임|뭐야)\s*$/u, "")
		.replace(/\s*(?:how (?:do|can) i|how to|what is|what's)\s+/iu, "")
		.trim();
	if (genericQuestion && genericQuestion !== trimmed) {
		return normalizeTitle(/[가-힣]/u.test(trimmed) ? `${genericQuestion} 관련 질문` : `${genericQuestion} question`);
	}
	return "";
}

function buildNonCopyTitle(text: string): string {
	const topic = stripRequestFraming(text)
		.replace(/[?？]+$/gu, "")
		.replace(/\s*(?:어떻게\s*(?:해야(?:함|해|하나|하나요|하냐|할까)?|함)|방법|가능(?:함|해|한가|할까)?|되나|됨|돼|되냐|될까|뭐임|뭐야)\s*$/u, "")
		.replace(/\b(?:please|can you|could you|would you|help me|i need you to|how do i|how can i|how to|what is|what's)\b/giu, " ")
		.replace(/\s+/gu, " ")
		.trim();
	if (!topic) return /[가-힣]/u.test(text) ? "새 세션" : "new session";
	return normalizeTitle(/[가-힣]/u.test(topic) ? `${topic} 관련 작업` : `${topic} task`);
}

function summarizeKnownTask(text: string): string {
	const korean = /[가-힣]/u.test(text);
	const suffix = /\bextensions?\b/iu.test(text) || /extensions?에/u.test(text) ? " extension" : "";
	const hasSessionTitle = /(session (name|title)|세션 (이름|제목))/iu.test(text);
	const hasTerminalTitle = /(terminal title|터미널 제목)/iu.test(text);
	if (hasSessionTitle && hasTerminalTitle) {
		if (korean) return `세션/터미널 제목 자동 설정${suffix}`;
		return `session/terminal title auto sync${suffix}`;
	}
	if (hasSessionTitle) {
		if (korean) return `세션 제목 자동 설정${suffix}`;
		return `session title auto naming${suffix}`;
	}
	if (hasTerminalTitle) {
		if (korean) return `터미널 제목 자동 설정${suffix}`;
		return `terminal title sync${suffix}`;
	}
	return "";
}

export function buildFallbackTitle(userPrompt: string): string {
	const cleaned = stripLogistics(sanitizeRequestText(userPrompt));
	if (!cleaned) return "";
	const summarized = summarizeKnownTask(cleaned);
	if (summarized) return normalizeTitle(summarized);
	const questionSummary = summarizeHowToPrompt(cleaned);
	if (questionSummary) return questionSummary;
	const parts = cleaned.split(/[\n\r]+|(?<=[.!?。！？])\s+/u).map((part) => stripRequestFraming(part)).filter(Boolean);
	const candidate = parts.find((part) => part.length >= 4) ?? stripRequestFraming(cleaned);
	const normalized = normalizeTitle(condenseActionPhrase(candidate));
	return looksLikePromptCopy(normalized, userPrompt) ? buildNonCopyTitle(cleaned) : normalized;
}
