import { SPONGES } from "../shared/game";
import { DishCanvas } from "./DishCanvas";
import { SpongeTray } from "./SpongeTray";
import { formatTime, useElapsed, useRoom } from "./useRoom";

// 練習用の皿はスポンジを消費しないので、どの色でもない灰色にする
const PRACTICE_SPONGE = "#bdbdbd";

// プロジェクターに映すプレイ画面
export function Screen({ room }: { room: string }) {
	const { state, send, serverNow } = useRoom(room);
	const elapsed = useElapsed(state, serverNow);

	if (!state) return <main className="screen">接続中…</main>;

	const directorUrl = `${location.origin}/director/${room}`;

	return (
		<main className="screen">
			{state.phase === "lobby" && (
				<>
					<h1 className="screen-title">きれいにしてゲームスタート！</h1>
					{/* 練習用の皿。きれいにするとゲームが始まる */}
					<DishCanvas key={`lobby-${state.seed}`} seed={state.seed + 1} kind={0} spongeColor={PRACTICE_SPONGE} onCleared={() => send({ type: "start" })} />
					<p className="screen-join">
						指示役は <strong>{directorUrl}</strong> をひらいてね（ルーム {room}）
					</p>
				</>
			)}

			{state.phase === "playing" && (
				<>
					<div className="hud hud-left">{formatTime(elapsed)}</div>
					<div className="hud hud-right">{state.current + 1}枚目</div>
					<DishCanvas
						key={`dish-${state.current}`}
						seed={state.seed}
						kind={state.dishes[state.current].kind}
						spongeColor={SPONGES[state.dishes[state.current].sponge].color}
						onProgress={(remaining) => send({ type: "progress", remaining })}
						onCleared={() => send({ type: "cleared" })}
					/>
					<SpongeTray dishes={state.dishes} current={state.current} />
				</>
			)}

			{state.phase === "finished" && (
				<div className="result">
					<p>ぜんぶキレイ！</p>
					<p className="result-time">{formatTime(elapsed)}</p>
					<div className="result-actions">
						<button className="button" onClick={() => send({ type: "next" })}>
							次のチームへ
						</button>
						<button className="button button-sub" onClick={() => send({ type: "reset" })}>
							新しい試合
						</button>
					</div>
				</div>
			)}
		</main>
	);
}
