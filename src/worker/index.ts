import { type Connection, routePartykitRequest, Server, type WSMessage } from "partyserver";
import {
	type ClientMessage,
	createDishes,
	DISH_COUNT,
	initialState,
	isFinalResult,
	NEXT_GAME_SECONDS,
	normalizeTeamName,
	RANKING_SIZE,
	type RoomState,
	SETUP_SECONDS,
	type ServerMessage,
	TEAMS,
	type Team,
} from "../shared/game";

export { Leaderboard } from "./leaderboard";

// 1ルーム = 1試合。ゲームの進行をまとめて、つながっている画面すべてに配る
export class GameRoom extends Server<Env> {
	static options = { hibernate: true };

	state: RoomState = initialState();
	// 名前を保存している途中のチーム（ランキングへの書き込みを待つあいだに、同じチームから二重に保存されないように）
	private saving = new Set<Team>();

	async onStart() {
		const saved = await this.ctx.storage.get<RoomState>("state");
		// 前の版で保存した状態に無い項目は、初期値で埋める
		if (saved) this.state = { ...initialState(), ...saved };
	}

	onConnect(connection: Connection) {
		connection.send(this.stateMessage());
	}

	async onMessage(connection: Connection, raw: WSMessage) {
		if (typeof raw !== "string") return;
		let message: ClientMessage;
		try {
			message = JSON.parse(raw) as ClientMessage;
		} catch {
			return;
		}
		const team = teamOf(connection);
		if (message.type === "save" || message.type === "skip") {
			if (await this.decide(message, team)) await this.commit();
			return;
		}
		if (!this.apply(message, team)) return;
		// 結果発表になったら、ランキングを読み込んでから配る
		if (isFinalResult(this.state) && this.state.ranking.length === 0) await this.loadRanking();
		await this.commit();
	}

	// アラームは 2 種類：セッティングの時間切れと、結果発表のあとの新しいゲームへの切り替え
	async onAlarm() {
		const s = this.state;
		if (s.phase === "setup") {
			// その時の向きと部位で確定して、プレイを始める
			this.state = { ...s, phase: "playing", remaining: Array(DISH_COUNT).fill(1), startedAt: Date.now() };
			await this.commit();
		} else if (isFinalResult(s) && s.nextGameAt !== null) {
			this.state = initialState();
			await this.commit();
		}
	}

	// 結果発表のあと、チーム名を付けて保存する / 保存しない。両チームが選んだら、少ししてから新しいゲームへ
	private async decide(message: ClientMessage & { type: "save" | "skip" }, team: Team | null): Promise<boolean> {
		if (!team || !isFinalResult(this.state) || this.state.decisions[team] || this.saving.has(team)) return false;
		const timeMs = this.state.results[team];
		if (timeMs === null) return false;

		if (message.type === "skip") {
			this.state.decisions[team] = { type: "skipped" };
		} else {
			const name = normalizeTeamName(message.name);
			if (!name) return false;
			this.saving.add(team);
			try {
				const { id, rank } = await this.leaderboard().save({ name, timeMs, team, room: this.name });
				this.state.decisions[team] = { type: "saved", id, name, rank };
			} finally {
				this.saving.delete(team);
			}
			await this.loadRanking();
		}

		if (TEAMS.every((t) => this.state.decisions[t] !== null)) {
			const nextGameAt = Date.now() + NEXT_GAME_SECONDS * 1000;
			this.state.nextGameAt = nextGameAt;
			await this.ctx.storage.setAlarm(nextGameAt);
		}
		return true;
	}

	private async loadRanking() {
		this.state.ranking = await this.leaderboard().top(RANKING_SIZE);
	}

	private leaderboard() {
		return this.env.Leaderboard.get(this.env.Leaderboard.idFromName("global"));
	}

	// メッセージを状態に反映する。受け付けなかったら false
	// team は送ってきた指示役のチーム（プレイ画面からなら null）
	private apply(message: ClientMessage, team: Team | null): boolean {
		const s = this.state;
		const now = Date.now();

		switch (message.type) {
			case "start": {
				if (s.phase !== "lobby") return false;
				const setupEndsAt = now + SETUP_SECONDS * 1000;
				this.state = {
					...initialState(),
					team: s.team,
					results: s.results,
					phase: "setup",
					dishes: createDishes(),
					setupEndsAt,
				};
				void this.ctx.storage.setAlarm(setupEndsAt);
				return true;
			}
			case "rotate": {
				const target = s.dishes[message.dish];
				// アラームが届く前でも、締め切りを過ぎた操作は受け付けない
				if (!this.canSetUp(now, team) || !target) return false;
				target.rotation = (target.rotation + message.direction + 4) % 4;
				return true;
			}
			case "swap": {
				const a = s.dishes[message.a];
				const b = s.dishes[message.b];
				if (!this.canSetUp(now, team) || !a || !b || a === b) return false;
				// 入れ替えるだけなので、5枚で部位が重ならないのは崩れない
				[a.sponge, b.sponge] = [b.sponge, a.sponge];
				return true;
			}
			case "progress":
				if (s.phase !== "playing") return false;
				s.remaining[s.current] = message.remaining;
				return true;
			case "cleared":
				if (s.phase !== "playing") return false;
				s.remaining[s.current] = 0;
				if (s.current + 1 < s.dishes.length) {
					s.current++;
				} else {
					s.phase = "finished";
					s.finishedAt = now;
					s.results[s.team] = now - (s.startedAt ?? now);
				}
				return true;
			case "next":
				if (s.phase !== "finished" || s.team !== "A") return false;
				this.state = { ...initialState(), team: "B", results: s.results };
				return true;
			default:
				return false;
		}
	}

	// セッティングできるのは、今のチームの指示役が、締め切り前に送ったときだけ
	private canSetUp(now: number, team: Team | null): boolean {
		const s = this.state;
		return s.phase === "setup" && team === s.team && now < (s.setupEndsAt ?? 0);
	}

	private async commit() {
		await this.ctx.storage.put("state", this.state);
		this.broadcast(this.stateMessage());
	}

	private stateMessage(): string {
		const message: ServerMessage = { type: "state", state: this.state, now: Date.now() };
		return JSON.stringify(message);
	}
}

// 指示役は WebSocket の URL に ?team=A のように付けてつないでくる
function teamOf(connection: Connection): Team | null {
	if (!connection.uri) return null;
	const team = new URL(connection.uri).searchParams.get("team");
	return TEAMS.find((t) => t === team) ?? null;
}

export default {
	async fetch(request, env) {
		return (await routePartykitRequest(request, env)) ?? new Response("Not Found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;
