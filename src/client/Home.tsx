import { useState } from "react";

const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createRoomCode(): string {
	return Array.from({ length: 4 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join("");
}

export function Home() {
	const [code, setCode] = useState("");

	return (
		<main className="home">
			<h1>皿洗いゲーム</h1>
			<a className="button" href={`/screen/${createRoomCode()}`}>
				プレイ画面をひらく
			</a>
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
