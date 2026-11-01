import { useEffect, useState } from "react";
import { BODY_PART_LABELS, type RoomState, SPONGES, usedSponges } from "../shared/game";
import { DishPreview } from "./DishPreview";
import { formatTime, useCountdown, useElapsed, useRoom } from "./useRoom";

// 指示役のスマホ画面。セッティングで皿を回し、プレイ中は各ターンで使う部位を選ぶ
export function Director({ room }: { room: string }) {
	const { state, send, serverNow } = useRoom(room);
	const elapsed = useElapsed(state, serverNow);
	const setupLeft = useCountdown(state?.phase === "setup" ? state.setupEndsAt : null, serverNow);
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

	if (state.phase === "setup") {
		return (
			<main className="director">
				<h1 className="director-title">お皿のセッティング</h1>
				<p className="director-countdown">{Math.ceil(setupLeft / 1000)}秒</p>
				<p className="director-hint">時間切れになった向きで決まります。部位ごとに消しやすい向きにしよう</p>
				<ol className="setup-list">
					{state.dishes.map((dish, i) => (
						<li key={dish.seed} className="setup-item">
							<span className="setup-number">{i + 1}皿目</span>
							<DishPreview dirt={dish} remaining={1} className="setup-preview" />
							<div className="rotate-buttons">
								<button
									className="rotate"
									aria-label="左に回す"
									onClick={() => send({ type: "rotate", dish: i, direction: -1 })}
								>
									↺
								</button>
								<button
									className="rotate"
									aria-label="右に回す"
									onClick={() => send({ type: "rotate", dish: i, direction: 1 })}
								>
									↻
								</button>
							</div>
						</li>
					))}
				</ol>
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
				<DishPreview dirt={dish} remaining={state.remaining[view]} />
				<button className="arrow" aria-label="次の皿" onClick={() => move(1)}>
					▶
				</button>
			</div>

			<p className="director-number">
				{view + 1}皿目
				{view === state.current && state.phase === "playing" && <span className="badge">いまここ</span>}
				{state.remaining[view] === 0 && <span className="badge badge-done">キレイ</span>}
			</p>

			<PartPicker state={state} view={view} onChoose={(sponge) => send({ type: "choose", sponge })} />

			<ol className="dots">
				{state.dishes.map((d, i) => (
					<li key={d.seed}>
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

type PartPickerProps = { state: RoomState; view: number; onChoose: (sponge: number) => void };

// 今のターンの皿を見ているときだけ部位を選べる。使った部位はもう選べない
function PartPicker({ state, view, onChoose }: PartPickerProps) {
	const dish = state.dishes[view];
	const used = usedSponges(state.dishes);
	const choosing = state.phase === "playing" && view === state.current && dish.sponge === null;

	return (
		<>
			{choosing && <p className="director-hint">このターンで使う部位を選んで、実行役に伝えよう</p>}
			<ul className="parts">
				{SPONGES.map((sponge, i) => (
					<li key={sponge.name}>
						<button
							className={i === dish.sponge ? "part-button part-button-active" : "part-button"}
							disabled={!choosing || used.has(i)}
							onClick={() => onChoose(i)}
						>
							<span className="sponge-chip" style={{ background: sponge.color }} />
							{BODY_PART_LABELS[sponge.part]}
						</button>
					</li>
				))}
			</ul>
		</>
	);
}
