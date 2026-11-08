import { useEffect, useRef, useState } from "react";
import {
	BODY_PART_LABELS,
	type ClientMessage,
	directorPath,
	type RoomState,
	SPONGES,
	TEAMS,
	type Team,
	winner,
} from "../shared/game";
import { DishPreview } from "./DishPreview";
import { formatTime, useCountdown, useElapsed, useRoom } from "./useRoom";

// 指で動かしてからこれ以上離れたら、タップではなくドラッグとみなす（px）
const DRAG_START = 8;

// 指示役のスマホ画面。URL のチームが分からなければ、まずチームを選んでもらう
export function Director({ room, team }: { room: string; team: Team | null }) {
	if (!team) return <TeamPicker room={room} />;
	return <TeamDirector room={room} team={team} />;
}

function TeamPicker({ room }: { room: string }) {
	return (
		<main className="director">
			<h1 className="director-title">どちらのチーム？</h1>
			<div className="team-picker">
				{TEAMS.map((team) => (
					<a key={team} className="button" href={directorPath(room, team)}>
						{team}チームの指示役
					</a>
				))}
			</div>
		</main>
	);
}

// セッティングで皿を回して部位を割り当て、プレイ中は進み具合を見る。
// 操作できるのは自分のチームの番のときだけ（サーバーも、相手チームの番の操作は受け付けない）
function TeamDirector({ room, team }: { room: string; team: Team }) {
	const { state, send, serverNow } = useRoom(room, team);
	const elapsed = useElapsed(state, serverNow);
	const setupLeft = useCountdown(state?.phase === "setup" ? state.setupEndsAt : null, serverNow);
	const [view, setView] = useState(0);

	// 実行役が次の皿に進んだら、表示もその皿に合わせる
	const current = state?.current ?? 0;
	useEffect(() => setView(current), [current]);

	if (!state) return <main className="director">接続中…</main>;

	const badge = <p className="director-team">{team}チームの指示役</p>;

	if (state.team !== team || (state.phase === "finished" && team === "B")) {
		return (
			<main className="director">
				{badge}
				<TurnStatus state={state} team={team} elapsed={elapsed} />
			</main>
		);
	}

	if (state.phase === "lobby") {
		return (
			<main className="director">
				{badge}
				<h1 className="director-title">皿一覧</h1>
				<p className="director-wait">ゲームが始まるのを待っています…</p>
			</main>
		);
	}

	if (state.phase === "setup") {
		return (
			<main className="director">
				{badge}
				<h1 className="director-title">お皿のセッティング</h1>
				<p className="director-countdown">{Math.ceil(setupLeft / 1000)}秒</p>
				<p className="director-hint">
					色のブロックをつかんで、別の皿へドラッグすると部位が入れ替わるよ（2つタップでもOK）。↺ ↻
					で皿を回そう。時間切れのときの状態で決まります
				</p>
				<SetupList state={state} send={send} />
			</main>
		);
	}

	const dish = state.dishes[view];
	const sponge = SPONGES[dish.sponge];
	const move = (delta: number) => setView((v) => (v + delta + state.dishes.length) % state.dishes.length);

	return (
		<main className="director">
			{badge}
			<h1 className="director-title">皿一覧</h1>
			<p className="director-timer">{formatTime(elapsed)}</p>

			<div className="director-dish">
				<button className="arrow" aria-label="前の皿" onClick={() => move(-1)}>
					◀
				</button>
				<DishPreview dirt={dish} rim={sponge.pastel} remaining={state.remaining[view]} />
				<button className="arrow" aria-label="次の皿" onClick={() => move(1)}>
					▶
				</button>
			</div>

			<p className="director-number">
				{view + 1}皿目
				{view === state.current && state.phase === "playing" && <span className="badge">いまここ</span>}
				{state.remaining[view] === 0 && <span className="badge badge-done">キレイ</span>}
			</p>
			<p className="part-block part-block-static" style={{ background: sponge.color }}>
				{BODY_PART_LABELS[sponge.part]}
			</p>

			<ol className="dots">
				{state.dishes.map((d, i) => (
					<li key={d.seed}>
						<button
							className={["dot", i === view && "dot-view", state.remaining[i] === 0 && "dot-done"]
								.filter(Boolean)
								.join(" ")}
							aria-label={`${i + 1}皿目`}
							onClick={() => setView(i)}
						/>
					</li>
				))}
			</ol>
		</main>
	);
}

type Drag = {
	from: number;
	startX: number;
	startY: number;
	dx: number;
	dy: number;
	moved: boolean;
	over: number | null;
};

// 5枚の皿の一覧。部位のブロックは、別の皿のところへドラッグするか、2つ続けてタップすると入れ替わる
function SetupList({ state, send }: { state: RoomState; send: (message: ClientMessage) => void }) {
	const [drag, setDrag] = useState<Drag | null>(null);
	const [selected, setSelected] = useState<number | null>(null);
	const rowRefs = useRef<(HTMLLIElement | null)[]>([]);

	const rowAt = (y: number): number | null => {
		const index = rowRefs.current.findIndex((row) => {
			if (!row) return false;
			const rect = row.getBoundingClientRect();
			return y >= rect.top && y <= rect.bottom;
		});
		return index === -1 ? null : index;
	};

	const swap = (a: number, b: number) => {
		if (a !== b) send({ type: "swap", a, b });
	};

	const onPointerDown = (i: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
		e.currentTarget.setPointerCapture(e.pointerId);
		setDrag({ from: i, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, moved: false, over: i });
	};

	const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
		if (!drag) return;
		const dx = e.clientX - drag.startX;
		const dy = e.clientY - drag.startY;
		const moved = drag.moved || Math.hypot(dx, dy) > DRAG_START;
		const over = moved ? rowAt(e.clientY) : drag.over;
		// つかんだ瞬間と、別の皿の上に来たときに軽く震わせる（対応している端末だけ）
		if ((moved && !drag.moved) || (moved && over !== drag.over && over !== null)) buzz();
		setDrag({ ...drag, dx, dy, moved, over });
	};

	const onPointerUp = () => {
		if (!drag) return;
		if (drag.moved) {
			if (drag.over !== null && drag.over !== drag.from) {
				swap(drag.from, drag.over);
				buzz(20);
			}
			setSelected(null);
		} else if (selected === null) {
			setSelected(drag.from);
		} else {
			swap(selected, drag.from);
			setSelected(null);
		}
		setDrag(null);
	};

	return (
		<ol className={drag?.moved ? "setup-list setup-list-dragging" : "setup-list"}>
			{state.dishes.map((dish, i) => {
				const sponge = SPONGES[dish.sponge];
				const dragging = drag?.moved && drag.from === i;
				return (
					<li
						key={dish.seed}
						ref={(el) => {
							rowRefs.current[i] = el;
						}}
						className={
							drag?.moved && drag.over === i && drag.from !== i ? "setup-item setup-item-target" : "setup-item"
						}
					>
						<span className="setup-number">{i + 1}</span>
						<DishPreview dirt={dish} rim={sponge.pastel} remaining={1} className="setup-preview" />
						<button
							className={["part-block", selected === i && "part-block-selected", dragging && "part-block-dragging"]
								.filter(Boolean)
								.join(" ")}
							style={
								{
									background: sponge.color,
									// 持ち上げて少し傾けると「つかんでいる」感じが出る
									transform: dragging ? `translate(${drag.dx}px, ${drag.dy}px) rotate(-3deg) scale(1.08)` : undefined,
									// セッティングが始まったとき、ブロックが順番に揺れて「動かせる」ことを知らせる
									"--i": i,
								} as React.CSSProperties
							}
							aria-label={`${i + 1}皿目の部位：${BODY_PART_LABELS[sponge.part]}`}
							onPointerDown={onPointerDown(i)}
							onPointerMove={onPointerMove}
							onPointerUp={onPointerUp}
							onPointerCancel={() => setDrag(null)}
						>
							<span className="part-grip" aria-hidden="true" />
							{BODY_PART_LABELS[sponge.part]}
						</button>
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
				);
			})}
		</ol>
	);
}

// 自分のチームが操作できないあいだに出す。相手の番の進み具合と、ここまでの結果
function TurnStatus({ state, team, elapsed }: { state: RoomState; team: Team; elapsed: number }) {
	const won = winner(state.results);
	if (won) return <FinalResult results={state.results} team={team} won={won} />;

	return (
		<>
			<p className="director-wait">
				{team === "B"
					? "いまは A チームの番です。B チームの番まで待っててね"
					: "A チームの番は終わりました。B チームの番を見守ろう"}
			</p>
			{state.phase === "playing" && (
				<p className="director-timer">
					{state.team}チーム {formatTime(elapsed)}
				</p>
			)}
			<ScoreCards results={state.results} team={team} won={null} />
		</>
	);
}

// 両チームが終わったあとの結果。勝ったチームには紙吹雪
type FinalResultProps = { results: RoomState["results"]; team: Team; won: Team | "draw" };

function FinalResult({ results, team, won }: FinalResultProps) {
	const outcome = won === "draw" ? "draw" : won === team ? "win" : "lose";
	const gap = Math.abs((results.A ?? 0) - (results.B ?? 0));
	return (
		<section className={`final final-${outcome}`}>
			{outcome === "win" && <Confetti />}
			<p className="final-label">{outcome === "win" ? "WIN!" : outcome === "lose" ? "LOSE" : "DRAW"}</p>
			<p className="final-message">
				{outcome === "win" ? "勝ち！おめでとう！" : outcome === "lose" ? "負けちゃった…" : "引き分け！"}
			</p>
			{outcome !== "draw" && <p className="final-gap">{(gap / 1000).toFixed(2)} 秒差</p>}
			<ScoreCards results={results} team={team} won={won} />
		</section>
	);
}

// 2チームのタイムを横に並べる。自分のチームと勝ったチームに印を付ける
function ScoreCards({ results, team, won }: { results: RoomState["results"]; team: Team; won: Team | "draw" | null }) {
	return (
		<ol className="score-cards">
			{TEAMS.map((t) => (
				<li key={t} className={t === won ? "score-card score-card-won" : "score-card"}>
					{t === won && <span className="score-card-crown">WINNER</span>}
					<span className="score-card-team">{t}チーム</span>
					<span className="score-card-time">{results[t] === null ? "--:--:--" : formatTime(results[t])}</span>
					{t === team && <span className="score-card-you">あなたのチーム</span>}
				</li>
			))}
		</ol>
	);
}

// 部位の 5 色で紙吹雪を降らせる。位置と速さは番号から決めるので、描き直しても変わらない
const CONFETTI_COUNT = 30;

function Confetti() {
	return (
		<div className="confetti" aria-hidden="true">
			{Array.from({ length: CONFETTI_COUNT }, (_, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: 数が変わらない飾り
					key={i}
					style={
						{
							background: SPONGES[i % SPONGES.length].color,
							left: `${(i * 37) % 100}%`,
							"--delay": `${((i * 7) % 20) / 10}s`,
							"--duration": `${2.4 + ((i * 13) % 10) / 10}s`,
							"--drift": `${((i * 29) % 60) - 30}px`,
						} as React.CSSProperties
					}
				/>
			))}
		</div>
	);
}

// 指示役のスマホを短く震わせる（Android の Chrome など、対応している端末だけ）
function buzz(ms = 10) {
	navigator.vibrate?.(ms);
}
