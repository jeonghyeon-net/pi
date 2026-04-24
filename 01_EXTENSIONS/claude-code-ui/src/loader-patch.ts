import { stripAnsi } from "./ansi.js";
import { resolveFromModule } from "./internal-module.js";

type LoaderPrototype = {
	render(width: number): string[];
	__claudeCodeUiPatched?: boolean;
};

type LoaderModule = { Loader?: { prototype?: LoaderPrototype } };
type LoaderFactory = () => Promise<LoaderModule>;

function trim(lines: string[]) {
	/* v8 ignore next */
	while (lines.length && !stripAnsi(lines[0] ?? "").trim()) lines.shift();
	/* v8 ignore next */
	while (lines.length && !stripAnsi(lines.at(-1) ?? "").trim()) lines.pop();
	return lines;
}

function isDefaultWorkingLine(lines: string[]) {
	const text = stripAnsi(lines.join("\n")).trim().replace(/^[^\p{L}\p{N}]+/u, "").trimStart();
	return /^Working\.\.\.(?: \(.*\))?$/.test(text);
}

export function patchLoaderPrototype(prototype?: LoaderPrototype) {
	if (!prototype || prototype.__claudeCodeUiPatched) return false;
	const render = prototype.render;
	prototype.render = function renderPatched(width) {
		const lines = trim(render.call(this, width));
		return !lines.length || isDefaultWorkingLine(lines) ? [] : ["", ...lines];
	};
	prototype.__claudeCodeUiPatched = true;
	return true;
}

/* v8 ignore next 4 */
async function loadLoaderModule() {
	const main = import.meta.resolve("@mariozechner/pi-coding-agent");
	return import(resolveFromModule(main, "../node_modules/@mariozechner/pi-tui/dist/components/loader.js"));
}

export async function applyLoaderPatch(load: LoaderFactory = loadLoaderModule) {
	const module = await load();
	patchLoaderPrototype(module.Loader?.prototype);
}
