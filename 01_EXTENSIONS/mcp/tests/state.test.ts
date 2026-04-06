import { describe, it, expect, beforeEach } from "vitest";
import {
	getGeneration,
	incrementGeneration,
	getConfig,
	setConfig,
	getConnections,
	setConnection,
	removeConnection,
	getMetadata,
	setMetadata,
	getAllMetadata,
	updateFooterStatus,
	resetState,
} from "../src/state.js";
import type { McpConfig } from "../src/types-config.js";
import type { ToolMetadata } from "../src/types-tool.js";

describe("state", () => {
	beforeEach(() => {
		resetState();
	});

	it("generation starts at 0", () => {
		expect(getGeneration()).toBe(0);
	});

	it("incrementGeneration returns new value", () => {
		expect(incrementGeneration()).toBe(1);
		expect(incrementGeneration()).toBe(2);
		expect(getGeneration()).toBe(2);
	});

	it("config is null initially", () => {
		expect(getConfig()).toBeNull();
	});

	it("setConfig/getConfig round-trip", () => {
		const cfg: McpConfig = { mcpServers: { test: { command: "node" } } };
		setConfig(cfg);
		expect(getConfig()).toBe(cfg);
	});

	it("connections map is empty initially", () => {
		expect(getConnections().size).toBe(0);
	});

	it("setConnection and removeConnection", () => {
		setConnection("srv", { fake: true });
		expect(getConnections().has("srv")).toBe(true);
		removeConnection("srv");
		expect(getConnections().has("srv")).toBe(false);
	});

	it("metadata set and get", () => {
		const tools: ToolMetadata[] = [
			{ name: "t", originalName: "t", serverName: "s", description: "d" },
		];
		setMetadata("s", tools);
		expect(getMetadata("s")).toBe(tools);
		expect(getAllMetadata().size).toBe(1);
	});

	it("resetState clears everything", () => {
		setConfig({ mcpServers: { a: { command: "x" } } });
		setConnection("srv", {});
		setMetadata("srv", []);
		incrementGeneration();
		resetState();
		expect(getGeneration()).toBe(0);
		expect(getConfig()).toBeNull();
		expect(getConnections().size).toBe(0);
		expect(getAllMetadata().size).toBe(0);
	});

	it("updateFooterStatus calls setStatus with correct format", () => {
		setConnection("a", {});
		setConnection("b", {});
		let capturedKey = "";
		let capturedText = "";
		const ui = {
			setStatus(key: string, text: string | undefined) {
				capturedKey = key;
				capturedText = text ?? "";
			},
			theme: {
				fg(_color: string, text: string) { return text; },
			},
		};
		updateFooterStatus(ui, 5);
		expect(capturedKey).toBe("mcp");
		expect(capturedText).toBe("MCP: 2/5 servers");
	});
});
