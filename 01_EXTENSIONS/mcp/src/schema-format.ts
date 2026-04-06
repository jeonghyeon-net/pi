import { truncateAtWord } from "./truncate.js";

interface SchemaObj {
	type?: string;
	properties?: Record<string, PropSchema>;
	required?: string[];
}

interface PropSchema {
	type?: string;
	description?: string;
	enum?: string[];
	default?: unknown;
}

export function formatSchema(schema: unknown): string {
	if (!schema) return "(no parameters)";
	const obj = schema as SchemaObj;
	if (!obj.properties || Object.keys(obj.properties).length === 0) return "(no parameters)";
	const required = new Set(obj.required ?? []);
	const lines: string[] = [];
	for (const [name, prop] of Object.entries(obj.properties)) {
		lines.push(formatProp(name, prop, required.has(name)));
	}
	return lines.join("\n");
}

function formatProp(name: string, prop: PropSchema, isRequired: boolean): string {
	const parts = [`  ${name}: ${prop.type ?? "unknown"}`];
	if (prop.enum) parts.push(`(${prop.enum.join(" | ")})`);
	parts.push(isRequired ? "[required]" : "[optional]");
	if (prop.description) parts.push(`- ${truncateAtWord(prop.description, 60)}`);
	return parts.join(" ");
}
