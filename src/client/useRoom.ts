import usePartySocket from "partysocket/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, RoomState, ServerMessage, Team } from "../shared/game";

// team は指示役のときだけ渡す。サーバーはこれで、どちらのチームの指示役かを見分ける
export function useRoom(room: string, team?: Team) {
	const [state, setState] = useState<RoomState | null>(null);
	// サーバーと端末の時計のずれ。タイマーをどの画面でも揃えるために使う
	const clockOffset = useRef(0);

	const socket = usePartySocket({
		party: "game-room",
		room,
		query: team ? { team } : undefined,
		onMessage(event) {
			const message = JSON.parse(event.data) as ServerMessage;
			clockOffset.current = message.now - Date.now();
			setState(message.state);
		},
	});

	const send = useCallback((message: ClientMessage) => socket.send(JSON.stringify(message)), [socket]);
	const serverNow = useCallback(() => Date.now() + clockOffset.current, []);

	return { state, send, serverNow };
}

// active の間、毎フレーム描き直す
function useAnimationFrame(active: boolean) {
	const [, setTick] = useState(0);

	useEffect(() => {
		if (!active) return;
		let frame = requestAnimationFrame(function loop() {
			setTick((t) => t + 1);
			frame = requestAnimationFrame(loop);
		});
		return () => cancelAnimationFrame(frame);
	}, [active]);
}

export function useElapsed(state: RoomState | null, serverNow: () => number): number {
	useAnimationFrame(state?.phase === "playing");
	if (!state?.startedAt) return 0;
	return (state.finishedAt ?? serverNow()) - state.startedAt;
}

// endsAt までの残りミリ秒
export function useCountdown(endsAt: number | null, serverNow: () => number): number {
	useAnimationFrame(endsAt !== null);
	return endsAt === null ? 0 : Math.max(0, endsAt - serverNow());
}

export function formatTime(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 10));
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(Math.floor(total / 6000))}:${pad(Math.floor(total / 100) % 60)}:${pad(total % 100)}`;
}
