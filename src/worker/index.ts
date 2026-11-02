import { type Connection, routePartykitRequest, Server, type WSMessage } from "partyserver";
import {
	type ClientMessage,
	createDishes,
	DISH_COUNT,
	initialState,
	type RoomState,
	SETUP_SECONDS,
	type ServerMessage,
	TEAMS,
	type Team,
} from "../shared/game";

// 1ルーム = 1試合。ゲームの進行をまとめて、つながっている画面すべてに配る
export class GameRoom extends Server<Env> {
	static options = { hibernate: true };

	state: RoomState = initialState();

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
		if (this.apply(JSON.parse(raw) as ClientMessage, teamOf(connection))) await this.commit();
	}

	// セッティングの時間切れ。その時の向きと部位で確定して、プレイを始める
	async onAlarm() {
		if (this.state.phase !== "setup") return;
		this.state = {
			...this.state,
			phase: "playing",
			remaining: Array(DISH_COUNT).fill(1),
			startedAt: Date.now(),
		};
		await this.commit();
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
			case "reset":
				this.state = initialState();
				void this.ctx.storage.deleteAlarm();
				return true;
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
