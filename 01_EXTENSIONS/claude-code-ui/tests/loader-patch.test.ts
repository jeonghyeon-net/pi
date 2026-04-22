import { describe, expect, it } from "vitest";
import { applyLoaderPatch, patchLoaderPrototype } from "../src/loader-patch.ts";

class BlankLoader {
	frames = [];
	render() {
		return ["", ""];
	}
}

describe("loader patch", () => {
	it("suppresses blank and default working-line renders", async () => {
		class DefaultLoader {
			frames = [];
			render() {
				return ["", "Working... (escape to interrupt)", ""];
			}
		}
		expect(patchLoaderPrototype()).toBe(false);
		expect(patchLoaderPrototype(BlankLoader.prototype)).toBe(true);
		expect(patchLoaderPrototype(DefaultLoader.prototype)).toBe(true);
		expect(new BlankLoader().render()).toEqual([]);
		expect(new DefaultLoader().render()).toEqual([]);
		expect(patchLoaderPrototype(BlankLoader.prototype)).toBe(false);
		await applyLoaderPatch(async () => ({}));
	});

	it("keeps visible working lines and trims their outer gaps", async () => {
		class VisibleLoader {
			frames = [];
			render() {
				return ["", "Running bash · 2s", ""];
			}
		}
		class EmptyLoader {
			frames = [];
			render() {
				return [];
			}
		}
		class LoadedLoader {
			frames = [];
			render() {
				return ["", ""];
			}
		}
		expect(patchLoaderPrototype(VisibleLoader.prototype)).toBe(true);
		expect(patchLoaderPrototype(EmptyLoader.prototype)).toBe(true);
		await applyLoaderPatch(async () => ({ Loader: LoadedLoader }));
		expect(new LoadedLoader().render()).toEqual([]);
		expect(new EmptyLoader().render()).toEqual([]);
		expect(new VisibleLoader().render()).toEqual(["Running bash · 2s"]);
	});
});
