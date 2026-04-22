import { normalizeTitle } from "./title-format.js";

function cleanComparisonSide(text: string): string {
	return text
		.replace(/[?？]+$/gu, "")
		.replace(/\s*(?:누가\s*더\s*좋(?:음|아|냐|을까|은지)?|어느\s*(?:쪽|게)?\s*더\s*낫(?:냐|나|지|을까)?|뭐가\s*더\s*낫(?:냐|나|지|을까)?|어떤\s*게\s*더\s*좋(?:음|아|냐|을까)?|비교|차이|장단점|리뷰|후기|평가|반응|레딧).*$/u, "")
		.replace(/\s*(?:which\s+is\s+better|which\s+one\s+is\s+better|better|compare|comparison|differences?|pros\s+and\s+cons|user\s+reviews?|reviews?|reddit|레딧).*$/iu, "")
		.trim();
}

export function summarizeComparisonPrompt(text: string, stripRequestFraming: (text: string) => string): string {
	const trimmed = stripRequestFraming(text).replace(/\s+/gu, " ").trim();
	if (!trimmed || !/(?:\bvs\b|versus)/iu.test(trimmed)) return "";
	const match = trimmed.match(/(.+?)\s+(?:vs\.?|versus)\s+(.+)/iu);
	if (!match) return "";
	const left = cleanComparisonSide(match[1]);
	const right = cleanComparisonSide(match[2]);
	if (!left || !right) return "";
	const korean = /[가-힣]/u.test(trimmed);
	const hasReddit = /(reddit|레딧)/iu.test(trimmed);
	const hasReview = /(review|reviews|리뷰|후기|평가|반응)/iu.test(trimmed);
	const suffix = hasReddit ? (korean ? "레딧 리뷰 비교" : "Reddit review comparison") : hasReview ? (korean ? "리뷰 비교" : "review comparison") : korean ? "비교" : "comparison";
	return normalizeTitle(`${left} vs ${right} ${suffix}`);
}
