import { useState } from "react";

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
			<form
				className="join"
				onSubmit={(e) => {
					e.preventDefault();
					if (code) location.href = `/director/${code.toUpperCase()}`;
				}}
			>
				<input
					value={code}
					onChange={(e) => setCode(e.target.value)}
					placeholder="ルームコード"
					maxLength={4}
					autoCapitalize="characters"
				/>
				<button className="button" type="submit">
					指示役で参加
				</button>
			</form>
		</main>
	);
}
