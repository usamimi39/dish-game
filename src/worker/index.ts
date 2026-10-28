import { type Connection, routePartykitRequest, Server, type WSMessage } from "partyserver";
import {
	type ClientMessage,
	createDishes,
	DISH_COUNT,
	initialState,
	type RoomState,
	type ServerMessage,
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
		const message = JSON.parse(raw) as ClientMessage;
		const s = this.state;

		switch (message.type) {
			case "start":
				this.state = {
					...s,
					phase: "playing",
					dishes: createDishes(),
					current: 0,
					remaining: Array(DISH_COUNT).fill(1),
					startedAt: Date.now(),
					finishedAt: null,
				};
				break;
			case "progress":
				if (s.phase !== "playing") return;
				s.remaining[s.current] = message.remaining;
				break;
			case "cleared":
				if (s.phase !== "playing") return;
				s.remaining[s.current] = 0;
				if (s.current + 1 < s.dishes.length) {
					s.current++;
				} else {
					s.phase = "finished";
					s.finishedAt = Date.now();
				}
				break;
			case "next":
				this.state = initialState(s.seed);
				break;
			case "reset":
				this.state = initialState();
				break;
		}

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
