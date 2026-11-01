import { type Connection, routePartykitRequest, Server, type WSMessage } from "partyserver";
import {
	type ClientMessage,
	createDishes,
	DISH_COUNT,
	initialState,
	type RoomState,
	type ServerMessage,
	SETUP_SECONDS,
	SPONGES,
	usedSponges,
} from "../shared/game";

// 1ルーム = 1試合。ゲームの進行をまとめて、つながっている画面すべてに配る
export class GameRoom extends Server<Env> {
	static options = { hibernate: true };

	state: RoomState = initialState();

	async onStart() {
		const saved = await this.ctx.storage.get<RoomState>("state");
		if (saved) this.state = saved;
	}

	onConnect(connection: Connection) {
		connection.send(this.stateMessage());
	}

	async onMessage(_connection: Connection, raw: WSMessage) {
		if (typeof raw !== "string") return;
		if (this.apply(JSON.parse(raw) as ClientMessage)) await this.commit();
	}

	// セッティングの時間切れ。その時の向きで確定して、プレイを始める
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
	private apply(message: ClientMessage): boolean {
		const s = this.state;
		const now = Date.now();
		const dish = s.dishes[s.current];

		switch (message.type) {
			case "start": {
				if (s.phase !== "lobby") return false;
				const setupEndsAt = now + SETUP_SECONDS * 1000;
				this.state = { ...initialState(), phase: "setup", dishes: createDishes(), setupEndsAt };
				void this.ctx.storage.setAlarm(setupEndsAt);
				return true;
			}
			case "rotate": {
				const target = s.dishes[message.dish];
				// アラームが届く前でも、締め切りを過ぎた操作は受け付けない
				if (s.phase !== "setup" || !target || now >= (s.setupEndsAt ?? 0)) return false;
				target.rotation = (target.rotation + message.direction + 4) % 4;
				return true;
			}
			case "choose":
				if (s.phase !== "playing" || dish.sponge !== null) return false;
				if (!SPONGES[message.sponge] || usedSponges(s.dishes).has(message.sponge)) return false;
				dish.sponge = message.sponge;
				return true;
			case "progress":
				if (s.phase !== "playing" || dish.sponge === null) return false;
				s.remaining[s.current] = message.remaining;
				return true;
			case "cleared":
				if (s.phase !== "playing" || dish.sponge === null) return false;
				s.remaining[s.current] = 0;
				if (s.current + 1 < s.dishes.length) {
					s.current++;
				} else {
					s.phase = "finished";
					s.finishedAt = now;
				}
				return true;
			case "reset":
				this.state = initialState();
				void this.ctx.storage.deleteAlarm();
				return true;
		}
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

export default {
	async fetch(request, env) {
		return (await routePartykitRequest(request, env)) ?? new Response("Not Found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;
