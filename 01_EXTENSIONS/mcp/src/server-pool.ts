import type { ServerConnection } from "./types-server.js";

export class ServerPool {
	private readonly connections = new Map<string, ServerConnection>();
	private readonly pending = new Map<string, Promise<ServerConnection>>();

	get(name: string): ServerConnection | undefined {
		return this.connections.get(name);
	}

	add(name: string, conn: ServerConnection): void {
		this.connections.set(name, conn);
	}

	remove(name: string): void {
		this.connections.delete(name);
	}

	all(): Map<string, ServerConnection> {
		return this.connections;
	}

	async getOrConnect(
		name: string,
		connector: () => Promise<ServerConnection>,
	): Promise<ServerConnection> {
		const existing = this.connections.get(name);
		if (existing) return existing;

		const inflight = this.pending.get(name);
		if (inflight) return inflight;

		const promise = connector().then(
			(conn) => { this.connections.set(name, conn); this.pending.delete(name); return conn; },
			(err) => { this.pending.delete(name); throw err; },
		);
		this.pending.set(name, promise);
		return promise;
	}
}
