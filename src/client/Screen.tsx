import { useEffect, useRef, useState } from "react";
import {
	BODY_PART_LABELS,
	type DirtSpec,
	directorPath,
	RANKING_SIZE,
	type RoomState,
	SPONGES,
	TEAMS,
	winner,
} from "../shared/game";
import { DishCanvas, type DishInput } from "./DishCanvas";
import { DishPreview } from "./DishPreview";
import { DwellButton } from "./DwellButton";
import { FullscreenButton } from "./FullscreenButton";
import { QrCode } from "./QrCode";
import { getSettings } from "./tracking/settings";
import { useTracker } from "./tracking/useTracker";
import { formatTime, useCountdown, useElapsed, useRoom } from "./useRoom";

// 練習用の皿
const PRACTICE_DIRT: DirtSpec = { seed: 1, spread: 0, distance: 0, rotation: 0 };
// スタートや次へ進む操作は頭（赤）のマーカーだけで反応させる。赤がいちばん認識しやすく、頭なら届く位置＝画面の上に置ける
const HEAD = SPONGES.findIndex((s) => s.part === "head");

// URL に ?input=camera を付けるとカメラのマーカーで遊ぶ。付けなければマウス
const cameraMode = new URLSearchParams(location.search).get("input") === "camera";

// プロジェクターに映すプレイ画面
export function Screen({ room }: { room: string }) {
	const { state, send, serverNow } = useRoom(room);
	const elapsed = useElapsed(state, serverNow);
	const setupLeft = useCountdown(state?.phase === "setup" ? state.setupEndsAt : null, serverNow);
	const nextGameLeft = useCountdown(state?.nextGameAt ?? null, serverNow);
	const { tracker, error: cameraError } = useTracker(cameraMode, getSettings().deviceId);
	const leaving = useLeavingDish(state);

	if (!state) return <main className="screen">接続中…</main>;

	// マウスモードでは、マウスがその皿の部位の代わりになる
	const inputFor = (sponge: number | "any"): DishInput =>
		tracker ? { type: "camera", tracker, sponge } : { type: "mouse" };

	const dish = state.dishes[state.current];
	const sponge = dish && SPONGES[dish.sponge];

	return (
		<main className={state.phase === "lobby" || state.phase === "finished" ? "screen screen-top" : "screen"}>
			<FullscreenButton />
			{cameraMode && !tracker && (
				<p className="camera-status">{cameraError ? `カメラが使えません: ${cameraError}` : "カメラを準備中…"}</p>
			)}

			{state.phase === "lobby" && (
				<>
					{/* 練習用の皿。頭のマーカーできれいにするとセッティングが始まる。頭が届くよう画面の上に出す */}
					<DishCanvas
						key="lobby"
						dirt={PRACTICE_DIRT}
						rim={SPONGES[HEAD].pastel}
						spongeColor={SPONGES[HEAD].color}
						input={inputFor(HEAD)}
						onCleared={() => send({ type: "start" })}
					/>
					<h1 className="screen-title">
						{state.team}チームの番！{BODY_PART_LABELS[SPONGES[HEAD].part]}できれいにしてスタート
					</h1>
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
						{/* 頭のマーカーで押すので、ボタンは画面の上に置く */}
						<div className="result-actions">
							<DwellButton tracker={tracker} onActivate={() => send({ type: "next" })}>
								Bチームの番へ
							</DwellButton>
						</div>
						<p>Aチーム ぜんぶキレイ！</p>
						<p className="result-time">{formatTime(elapsed)}</p>
					</div>
				) : (
					<Scoreboard state={state} nextGameLeft={nextGameLeft} />
				))}
		</main>
	);
}

// 両チームが終わったあとの結果とランキング。タイムが短いほうの勝ち
// 新しいゲームへは、両チームの指示役がスマホで「保存する / 保存しない」を選ぶと進む（ここからは進めない）
function Scoreboard({ state, nextGameLeft }: { state: RoomState; nextGameLeft: number }) {
	const { results, decisions, ranking } = state;
	const won = winner(results);
	const ours = new Set(TEAMS.map((t) => decisions[t]).flatMap((d) => (d?.type === "saved" ? [d.id] : [])));

	return (
		<div className="final-board">
			<div className="result">
				<p className="result-winner">{won === "draw" ? "引き分け！" : `${won}チームの勝ち！`}</p>
				<ol className="scoreboard">
					{TEAMS.map((team) => {
						const decision = decisions[team];
						return (
							<li key={team} className={team === won ? "score score-won" : "score"}>
								<span className="score-team">
									{decision?.type === "saved" ? decision.name : `${team}チーム`}
									<span className="score-status">
										{decision === null
											? "スマホでチーム名を入力中…"
											: decision.type === "saved"
												? `${team}チーム・ランキング ${decision.rank}位`
												: `${team}チーム・保存しない`}
									</span>
								</span>
								<span className="score-time">{formatTime(results[team] ?? 0)}</span>
							</li>
						);
					})}
				</ol>
				<p className="next-game">
					{state.nextGameAt === null
						? "両チームがスマホで選ぶと、新しいゲームが始まります"
						: `${Math.ceil(nextGameLeft / 1000)}秒後に新しいゲーム`}
				</p>
			</div>

			<section className="ranking">
				<h2 className="ranking-title">ランキング TOP{RANKING_SIZE}</h2>
				{ranking.length === 0 ? (
					<p className="ranking-empty">まだ記録がありません</p>
				) : (
					<ol className="ranking-list">
						{ranking.map((entry, i) => (
							<li key={entry.id} className={ours.has(entry.id) ? "ranking-row ranking-row-new" : "ranking-row"}>
								<span className="ranking-rank">{i + 1}</span>
								<span className="ranking-name">{entry.name}</span>
								<span className="ranking-time">{formatTime(entry.timeMs)}</span>
							</li>
						))}
					</ol>
				)}
			</section>
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
