import { useEffect, useState } from "react";
import { BODY_PART_LABELS, BODY_PARTS, SPONGES } from "../shared/game";
import { DishPreview } from "./DishPreview";
import { formatTime, useElapsed, useRoom } from "./useRoom";

// 指示役のスマホ画面。全部の皿の状態と、それぞれに使う部位を見られる
export function Director({ room }: { room: string }) {
	const { state, serverNow } = useRoom(room);
	const elapsed = useElapsed(state, serverNow);
	const [view, setView] = useState(0);

	// 実行役が次の皿に進んだら、表示もその皿に合わせる
	const current = state?.current ?? 0;
	useEffect(() => setView(current), [current]);

	if (!state) return <main className="director">接続中…</main>;

	if (state.phase === "lobby") {
		return (
			<main className="director">
				<h1 className="director-title">皿一覧</h1>
				<p className="director-wait">ゲームが始まるのを待っています…</p>
			</main>
		);
	}

	const dish = state.dishes[view];
	const move = (delta: number) => setView((v) => (v + delta + state.dishes.length) % state.dishes.length);

	return (
		<main className="director">
			<h1 className="director-title">皿一覧</h1>
			<p className="director-timer">{formatTime(elapsed)}</p>

			<div className="director-dish">
				<button className="arrow" aria-label="前の皿" onClick={() => move(-1)}>
					◀
				</button>
				<DishPreview seed={state.seed} kind={dish.kind} remaining={state.remaining[view]} />
				<button className="arrow" aria-label="次の皿" onClick={() => move(1)}>
					▶
				</button>
			</div>

			<p className="director-number">
				<span className="sponge-chip" style={{ background: SPONGES[dish.sponge].color }} aria-label={SPONGES[dish.sponge].name} />
				{view + 1}皿目
				{view === state.current && state.phase === "playing" && <span className="badge">いまここ</span>}
				{state.remaining[view] === 0 && <span className="badge badge-done">キレイ</span>}
			</p>

			<ul className="parts">
				{BODY_PARTS.map((part) => (
					<li key={part} className={part === dish.part ? "part part-active" : "part"}>
						{BODY_PART_LABELS[part]}
					</li>
				))}
			</ul>

			<ol className="dots">
				{state.dishes.map((_, i) => (
					<li key={i}>
						<button
							className={["dot", i === view && "dot-view", state.remaining[i] === 0 && "dot-done"].filter(Boolean).join(" ")}
							aria-label={`${i + 1}皿目`}
							onClick={() => setView(i)}
						/>
					</li>
				))}
			</ol>
		</main>
	);
}
