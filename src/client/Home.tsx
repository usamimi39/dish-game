import { useState } from "react";
import { directorPath, TEAMS } from "../shared/game";

const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createRoomCode(): string {
	return Array.from({ length: 4 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join("");
}

export function Home() {
	const [code, setCode] = useState("");

	return (
		<main className="home">
			<h1>皿洗いゲーム</h1>
			<div className="home-actions">
				<a className="button" href={`/screen/${createRoomCode()}`}>
					プレイ画面（マウス）
				</a>
				<a className="button" href={`/screen/${createRoomCode()}?input=camera`}>
					プレイ画面（カメラ）
				</a>
				<a className="button button-sub" href="/calibrate">
					カメラの調整
				</a>
			</div>
			{/* ふだんはプレイ画面の QR から入る。読めないときはルームコードとチームを選んで入る */}
			<div className="join">
				<input
					value={code}
					onChange={(e) => setCode(e.target.value)}
					placeholder="ルームコード"
					maxLength={4}
					autoCapitalize="characters"
				/>
				{TEAMS.map((team) => (
					<button
						key={team}
						className="button"
						disabled={!code}
						onClick={() => {
							location.href = directorPath(code.toUpperCase(), team);
						}}
					>
						{team}チームの指示役
					</button>
				))}
			</div>
		</main>
	);
}
