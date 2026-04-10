import { describe, expect, it, vi } from "vitest";
import { OverviewOverlayComponent } from "../src/overlay-component.js";

describe("OverviewOverlayComponent", () => {
	it("renders a trailing top-border line and wraps long body text without ellipsis", () => {
		const component = new OverviewOverlayComponent({ requestRender: vi.fn() }, { fg: vi.fn((_color: string, text: string) => text) }, { title: "제목", summary: ["이 요약은 상자 폭을 넘어가더라도 말줄임표 대신 자연스럽게 줄바꿈되어야 한다고 사용자가 요청했다"] });
		const first = component.render(64);
		expect(component.render(64)).toBe(first);
		expect(component.render(68)).not.toBe(first);
		expect(first[0]).toMatch(/^╭─ 제목 ─+╮$/);
		expect(first.some((line) => line.includes("..."))).toBe(false);
		expect(first.length).toBeGreaterThan(3);
	});

	it("invalidates and requests a render when content changes", () => {
		const tui = { requestRender: vi.fn() };
		const component = new OverviewOverlayComponent(tui, { fg: vi.fn((_color: string, text: string) => text) }, undefined, "임시 제목");
		const first = component.render(64);
		component.setContent({ title: "새 제목", summary: ["요약 내용을 새로 반영함"] }, "새 제목");
		expect(tui.requestRender).toHaveBeenCalled();
		expect(component.render(64)).not.toBe(first);
	});
});
