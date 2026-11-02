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
					皿を回して、色のブロックを入れ替えて部位を決めよう。時間切れになったときの状態で決まります
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
		setDrag({ ...drag, dx, dy, moved, over: moved ? rowAt(e.clientY) : drag.over });
	};

	const onPointerUp = () => {
		if (!drag) return;
		if (drag.moved) {
			if (drag.over !== null) swap(drag.from, drag.over);
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
		<ol className="setup-list">
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
							style={{
								background: sponge.color,
								transform: dragging ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
							}}
							aria-label={`${i + 1}皿目の部位：${BODY_PART_LABELS[sponge.part]}`}
							onPointerDown={onPointerDown(i)}
							onPointerMove={onPointerMove}
							onPointerUp={onPointerUp}
							onPointerCancel={() => setDrag(null)}
						>
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
	const other = state.team;
	const won = winner(state.results);

	let message: string;
	if (won) message = won === "draw" ? "引き分け！" : won === team ? "勝ち！おめでとう！" : "負けちゃった…";
	else if (team === "B") message = "いまは A チームの番です。B チームの番まで待っててね";
	else message = "A チームの番は終わりました。B チームの番を見守ろう";

	return (
		<>
			<p className="director-wait">{message}</p>
			{!won && state.phase === "playing" && (
				<p className="director-timer">
					{other}チーム {formatTime(elapsed)}
				</p>
			)}
			<ol className="director-results">
				{TEAMS.map((t) => (
					<li key={t}>
						{t}チーム：{state.results[t] === null ? "まだ" : formatTime(state.results[t])}
					</li>
				))}
			</ol>
		</>
	);
}
