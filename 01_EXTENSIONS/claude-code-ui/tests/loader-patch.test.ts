import { describe, expect, it } from "vitest";
import { applyLoaderPatch, patchLoaderPrototype } from "../src/loader-patch.ts";

class BlankLoader {
	render() {
		return ["", ""];
	}
}

describe("loader patch", () => {
	it("suppresses blank working-line renders", async () => {
		expect(patchLoaderPrototype()).toBe(false);
		expect(patchLoaderPrototype(BlankLoader.prototype)).toBe(true);
		expect(new BlankLoader().render()).toEqual([]);
		expect(patchLoaderPrototype(BlankLoader.prototype)).toBe(false);
		await applyLoaderPatch(async () => ({}));
		await applyLoaderPatch();
	});

	it("keeps visible working lines and supports injected loaders", async () => {
		class VisibleLoader {
			render() {
				return ["", "Working..."];
			}
		}
		class SolidLoader {
			render() {
				return ["Working..."];
			}
		}
		class LoadedLoader extends BlankLoader {}
		expect(patchLoaderPrototype(VisibleLoader.prototype)).toBe(true);
		expect(patchLoaderPrototype(SolidLoader.prototype)).toBe(true);
		await applyLoaderPatch(async () => ({ Loader: LoadedLoader }));
		expect(new LoadedLoader().render()).toEqual([]);
		expect(new VisibleLoader().render()).toEqual(["", "Working..."]);
		expect(new SolidLoader().render()).toEqual(["Working..."]);
	});
});
