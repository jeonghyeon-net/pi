export interface McpErrorOpts {
	hint?: string;
	server?: string;
	tool?: string;
	uri?: string;
	cause?: Error;
}

export class McpError extends Error {
	readonly code: string;
	readonly hint: string | undefined;
	readonly context: Record<string, string | undefined>;

	constructor(code: string, message: string, opts?: McpErrorOpts) {
		super(message, opts?.cause ? { cause: opts.cause } : undefined);
		this.name = "McpError";
		this.code = code;
		this.hint = opts?.hint;
		this.context = {
			server: opts?.server,
			tool: opts?.tool,
			uri: opts?.uri,
		};
	}

	toJSON() {
		return {
			code: this.code,
			message: this.message,
			hint: this.hint,
			context: this.context,
		};
	}
}

export function mcpError(
	code: string,
	message: string,
	opts?: McpErrorOpts,
): McpError {
	return new McpError(code, message, opts);
}
