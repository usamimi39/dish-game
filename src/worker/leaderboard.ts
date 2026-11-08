import { DurableObject } from "cloudflare:workers";
import type { RankEntry, Team } from "../shared/game";

// ルームをまたいだランキング。インスタンスは "global" の 1 つだけ（SQLite 版の Durable Object）
// 名前を付けて保存したチームの記録だけが入る。保存しなかったチームの記録は、どこにも残さない
export class Leaderboard extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS runs (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				time_ms INTEGER NOT NULL,
				team TEXT NOT NULL,
				room TEXT NOT NULL,
				played_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS runs_time ON runs (time_ms, played_at);
		`);
	}

	// 記録を保存して、その記録の順位（同じタイムなら先に保存したほうが上）を返す
	save(entry: { name: string; timeMs: number; team: Team; room: string }): { id: string; rank: number } {
		const id = crypto.randomUUID();
		const playedAt = Date.now();
		const sql = this.ctx.storage.sql;
		sql.exec(
			"INSERT INTO runs (id, name, time_ms, team, room, played_at) VALUES (?, ?, ?, ?, ?, ?)",
			id,
			entry.name,
			entry.timeMs,
			entry.team,
			entry.room,
			playedAt,
		);
		const faster = sql
			.exec<{ count: number }>(
				"SELECT COUNT(*) AS count FROM runs WHERE time_ms < ? OR (time_ms = ? AND played_at < ?)",
				entry.timeMs,
				entry.timeMs,
				playedAt,
			)
			.one().count;
		return { id, rank: faster + 1 };
	}

	top(limit: number): RankEntry[] {
		return this.ctx.storage.sql
			.exec<{ id: string; name: string; time_ms: number }>(
				"SELECT id, name, time_ms FROM runs ORDER BY time_ms, played_at LIMIT ?",
				limit,
			)
			.toArray()
			.map((row) => ({ id: row.id, name: row.name, timeMs: row.time_ms }));
	}
}
