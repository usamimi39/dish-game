import { BODY_PART_LABELS, type DirtSpec, directorPath, type RoomState, SPONGES, TEAMS, winner } from "../shared/game";
import { DishCanvas, type DishInput } from "./DishCanvas";
import { QrCode } from "./QrCode";
import { getSettings } from "./tracking/settings";
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

	if (!state) return <main className="screen">接続中…</main>;

	// マウスモードでは、マウスがその皿の部位の代わりになる
	const inputFor = (sponge: number | "any"): DishInput =>
		tracker ? { type: "camera", tracker, sponge } : { type: "mouse" };

	const dish = state.dishes[state.current];
	const sponge = dish && SPONGES[dish.sponge];

	return (
		<main className="screen">
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
					<DishCanvas
						key={`dish-${state.current}`}
						dirt={dish}
						rim={sponge.pastel}
						spongeColor={sponge.color}
						input={inputFor(dish.sponge)}
						onProgress={(remaining) => send({ type: "progress", remaining })}
						onCleared={() => send({ type: "cleared" })}
					/>
				</>
			)}

			{state.phase === "finished" &&
				(state.team === "A" ? (
					<div className="result">
						<p>Aチーム ぜんぶキレイ！</p>
						<p className="result-time">{formatTime(elapsed)}</p>
						<div className="result-actions">
							<button className="button" onClick={() => send({ type: "next" })}>
								Bチームの番へ
							</button>
						</div>
					</div>
				) : (
					<Scoreboard results={state.results} onRestart={() => send({ type: "reset" })} />
				))}
		</main>
	);
}

// 両チームが終わったあとの結果。タイムが短いほうの勝ち
function Scoreboard({ results, onRestart }: { results: RoomState["results"]; onRestart: () => void }) {
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
				<button className="button" onClick={onRestart}>
					新しいゲーム
				</button>
			</div>
		</div>
	);
}
