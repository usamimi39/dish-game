import { BODY_PART_LABELS, type DirtSpec, SPONGES } from "../shared/game";
import { DishCanvas, type DishInput } from "./DishCanvas";
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

	const directorUrl = `${location.origin}/director/${room}`;
	const dish = state.dishes[state.current];
	const sponge = dish && SPONGES[dish.sponge];

	return (
		<main className="screen">
			{cameraMode && !tracker && (
				<p className="camera-status">{cameraError ? `カメラが使えません: ${cameraError}` : "カメラを準備中…"}</p>
			)}

			{state.phase === "lobby" && (
				<>
					<h1 className="screen-title">きれいにしてゲームスタート！</h1>
					{/* 練習用の皿。きれいにするとセッティングが始まる */}
					<DishCanvas
						key="lobby"
						dirt={PRACTICE_DIRT}
						spongeColor={PRACTICE_SPONGE}
						input={inputFor("any")}
						onCleared={() => send({ type: "start" })}
					/>
					<p className="screen-join">
						指示役は <strong>{directorUrl}</strong> をひらいてね（ルーム {room}）
					</p>
				</>
			)}

			{state.phase === "setup" && (
				// 実行役には皿を見せない
				<div className="setup-wait">
					<p>指示役がお皿をセッティング中…</p>
					<p className="setup-count">{Math.ceil(setupLeft / 1000)}</p>
				</div>
			)}

			{state.phase === "playing" && dish && (
				<>
					<div className="hud hud-left">{formatTime(elapsed)}</div>
					<div className="hud hud-right">{state.current + 1}枚目</div>
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

			{state.phase === "finished" && (
				<div className="result">
					<p>ぜんぶキレイ！</p>
					<p className="result-time">{formatTime(elapsed)}</p>
					<div className="result-actions">
						<button className="button" onClick={() => send({ type: "reset" })}>
							次のチームへ
						</button>
					</div>
				</div>
			)}
		</main>
	);
}
