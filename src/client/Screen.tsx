import { type DirtSpec, SPONGES, usedSponges } from "../shared/game";
import { DishCanvas, type DishInput } from "./DishCanvas";
import { SpongeTray } from "./SpongeTray";
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

	// マウスモードでは、マウスが「指示役が選んだ部位」の代わりになる
	const inputFor = (sponge: number | "any" | null): DishInput => {
		if (sponge === null) return { type: "none" };
		return tracker ? { type: "camera", tracker, sponge } : { type: "mouse" };
	};

	const directorUrl = `${location.origin}/director/${room}`;
	const dish = state.dishes[state.current];
	// 今の皿の色は終わるまで暗くしない（どの部位か分かってしまうので）
	const used = usedSponges(state.dishes.slice(0, state.current));

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
					<DishCanvas
						key={`dish-${state.current}`}
						dirt={dish}
						spongeColor={dish.sponge === null ? PRACTICE_SPONGE : SPONGES[dish.sponge].color}
						input={inputFor(dish.sponge)}
						onProgress={(remaining) => send({ type: "progress", remaining })}
						onCleared={() => send({ type: "cleared" })}
					/>
					{dish.sponge === null && <p className="screen-waiting">指示役の指示を待っています…</p>}
					<SpongeTray used={used} />
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
