import usePartySocket from "partysocket/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, RoomState, ServerMessage } from "../shared/game";

export function useRoom(room: string) {
	const [state, setState] = useState<RoomState | null>(null);
	// サーバーと端末の時計のずれ。タイマーをどの画面でも揃えるために使う
	const clockOffset = useRef(0);

	const socket = usePartySocket({
		party: "game-room",
		room,
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

export function useElapsed(state: RoomState | null, serverNow: () => number): number {
	const [, setTick] = useState(0);
	const running = state?.phase === "playing";

	useEffect(() => {
		if (!running) return;
		let frame = requestAnimationFrame(function loop() {
			setTick((t) => t + 1);
			frame = requestAnimationFrame(loop);
		});
		return () => cancelAnimationFrame(frame);
	}, [running]);

	if (!state?.startedAt) return 0;
	return (state.finishedAt ?? serverNow()) - state.startedAt;
}

export function formatTime(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 10));
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(Math.floor(total / 6000))}:${pad(Math.floor(total / 100) % 60)}:${pad(total % 100)}`;
}
