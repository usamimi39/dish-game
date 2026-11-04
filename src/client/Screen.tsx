import { useEffect, useRef, useState } from "react";
import { BODY_PART_LABELS, type DirtSpec, directorPath, type RoomState, SPONGES, TEAMS, winner } from "../shared/game";
import { DishCanvas, type DishInput } from "./DishCanvas";
import { DishPreview } from "./DishPreview";
import { DwellButton } from "./DwellButton";
import { FullscreenButton } from "./FullscreenButton";
import { QrCode } from "./QrCode";
import { getSettings } from "./tracking/settings";
import type { Tracker } from "./tracking/tracker";
import { useTracker } from "./tracking/useTracker";
import { formatTime, useCountdown, useElapsed, useRoom } from "./useRoom";

// 練習用の皿。スポンジを消費しないので、どの色でもない灰色で消す
const PRACTICE_DIRT: DirtSpec = { seed: 1, spread: 0, distance: 0, rotation: 0 };
const PRACTICE_SPONGE = "#bdbdbd";

// URL に ?input=camera を付けるとカメラのマーカーで遊ぶ。付けなければマウス
const cameraMode = new URLSearchParams(location.search).get("input") === "camera";

// プロジェクターに映すプレイ画面
export function Screen({ room }: { room: string }) {
	const { state, send, serverNow } = useRoom(room);
	const elapsed = useElapsed(state, serverNow);
	const setupLeft = useCountdown(state?.phase === "setup" ? state.setupEndsAt : null, serverNow);
	const { tracker, error: cameraError } = useTracker(cameraMode, getSettings().deviceId);
	const leaving = useLeavingDish(state);

	if (!state) return <main className="screen">接続中…</main>;

	// マウスモードでは、マウスがその皿の部位の代わりになる
	const inputFor = (sponge: number | "any"): DishInput =>
		tracker ? { type: "camera", tracker, sponge } : { type: "mouse" };

	const dish = state.dishes[state.current];
	const sponge = dish && SPONGES[dish.sponge];

	return (
		<main className="screen">
			<FullscreenButton />
			{cameraMode && !tracker && (
				<p className="camera-status">{cameraError ? `カメラが使えません: ${cameraError}` : "カメラを準備中…"}</p>
			)}

			{state.phase === "lobby" && (
				<>
					<h1 className="screen-title">{state.team}チームの番！きれいにしてスタート</h1>
					{/* 練習用の皿。きれいにするとセッティングが始まる */}
					<DishCanvas
						key="lobby"
						dirt={PRACTICE_DIRT}
						spongeColor={PRACTICE_SPONGE}
						input={inputFor("any")}
						onCleared={() => send({ type: "start" })}
					/>
					{/* 指示役はスマホで自分のチームの QR を読み取って参加する。A は左、B は右 */}
					{TEAMS.map((team) => (
						<aside
							key={team}
							className={`join-card join-card-${team}${team === state.team ? " join-card-active" : ""}`}
						>
							<p className="join-team">{team}チームの指示役</p>
							<QrCode value={location.origin + directorPath(room, team)} className="join-qr" />
							<p className="join-room">
								ルーム {room}-{team}
							</p>
						</aside>
					))}
				</>
			)}

			{state.phase === "setup" && (
				// 実行役には皿を見せない
				<div className="setup-wait">
					<p>{state.team}チームの指示役がお皿をセッティング中…</p>
					<p className="setup-count">{Math.ceil(setupLeft / 1000)}</p>
				</div>
			)}

			{state.phase === "playing" && dish && (
				<>
					<div className="hud hud-left">{formatTime(elapsed)}</div>
					<div className="hud hud-right">
						{state.team}チーム {state.current + 1}枚目
					</div>
					<p className="screen-part">
						<span className="screen-part-chip" style={{ background: sponge.color }} />
						{BODY_PART_LABELS[sponge.part]}
					</p>
					{/* 新しい皿は左からスライドしてくる */}
					<div key={`dish-${state.current}`} className="dish-slide-in">
						<DishCanvas
							dirt={dish}
							rim={sponge.pastel}
							spongeColor={sponge.color}
							input={inputFor(dish.sponge)}
							onProgress={(remaining) => send({ type: "progress", remaining })}
							onCleared={() => send({ type: "cleared" })}
						/>
					</div>
					{/* 洗い終わった皿は、きれいになった姿で右の水切りかごへ飛んでいく */}
					{leaving !== null && state.dishes[leaving] && (
						<DishPreview
							key={`leaving-${leaving}`}
							dirt={state.dishes[leaving]}
							rim={SPONGES[state.dishes[leaving].sponge].pastel}
							remaining={0}
							className="dish-leaving"
						/>
					)}
					<DishRack state={state} />
				</>
			)}

			{state.phase === "finished" &&
				(state.team === "A" ? (
					<div className="result">
						<p>Aチーム ぜんぶキレイ！</p>
						<p className="result-time">{formatTime(elapsed)}</p>
						<div className="result-actions">
							<DwellButton tracker={tracker} onActivate={() => send({ type: "next" })}>
								Bチームの番へ
							</DwellButton>
						</div>
					</div>
				) : (
					<Scoreboard results={state.results} tracker={tracker} onRestart={() => send({ type: "reset" })} />
				))}
		</main>
	);
}

// 両チームが終わったあとの結果。タイムが短いほうの勝ち
type ScoreboardProps = { results: RoomState["results"]; tracker: Tracker | null; onRestart: () => void };

function Scoreboard({ results, tracker, onRestart }: ScoreboardProps) {
	const won = winner(results);
	return (
		<div className="result">
			<p className="result-winner">{won === "draw" ? "引き分け！" : `${won}チームの勝ち！`}</p>
			<ol className="scoreboard">
				{TEAMS.map((team) => (
					<li key={team} className={team === won ? "score score-won" : "score"}>
						<span className="score-team">{team}チーム</span>
						<span className="score-time">{formatTime(results[team] ?? 0)}</span>
					</li>
				))}
			</ol>
			<div className="result-actions">
				<DwellButton tracker={tracker} onActivate={onRestart}>
					新しいゲーム
				</DwellButton>
			</div>
		</div>
	);
}

// 皿が洗い終わって次に進んだ直後のあいだだけ、その皿の番号を返す（右へ飛んでいく演出に使う）
const LEAVING_MS = 700;

function useLeavingDish(state: RoomState | null): number | null {
	const [leaving, setLeaving] = useState<number | null>(null);
	const previous = useRef<number | null>(null);
	const current = state?.phase === "playing" ? state.current : null;

	useEffect(() => {
		const before = previous.current;
		previous.current = current;
		if (before === null || current === null || current <= before) return;
		setLeaving(before);
		const timer = setTimeout(() => setLeaving(null), LEAVING_MS);
		return () => clearTimeout(timer);
	}, [current]);

	return leaving;
}

// 右側に、洗い終わった皿が立てて干されていく（上から見ているので細長く見える。かごは描かない）
function DishRack({ state }: { state: RoomState }) {
	return (
		<aside className="rack" aria-label={`洗い終わった皿 ${state.current}枚`}>
			<ol className="rack-slots">
				{state.dishes.map((dish, i) => (
					<li key={dish.seed} className="rack-slot">
						{i < state.current && (
							<DishPreview
								dirt={dish}
								rim={SPONGES[dish.sponge].pastel}
								remaining={0}
								className={i === state.current - 1 ? "rack-dish rack-dish-new" : "rack-dish"}
							/>
						)}
					</li>
				))}
			</ol>
		</aside>
	);
}
