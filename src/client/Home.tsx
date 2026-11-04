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
			<header className="home-header">
				<h1>皿洗いゲーム</h1>
				<p>指示役と実行役の2人で、5枚のお皿をいちばん早くきれいにしよう</p>
			</header>

			<section className="home-card">
				<h2>プレイ画面をひらく</h2>
				<p className="home-note">プロジェクターにつないだ PC で開いてね</p>
				<a className="button button-large" href={`/screen/${createRoomCode()}?input=camera`}>
					カメラではじめる
				</a>
				<div className="home-links">
					<a href="/calibrate">カメラの色を合わせる</a>
					<a href={`/screen/${createRoomCode()}`}>マウスで試す</a>
				</div>
			</section>

			<section className="home-card">
				<h2>指示役で参加する</h2>
				<p className="home-note">ふつうはプレイ画面の QR を読み取ればOK。読めないときはルームコードを入れてね</p>
				<input
					className="home-code"
					value={code}
					onChange={(e) => setCode(e.target.value.toUpperCase())}
					placeholder="ルームコード（4文字）"
					maxLength={4}
					autoCapitalize="characters"
					autoComplete="off"
				/>
				<div className="home-teams">
					{TEAMS.map((team) => (
						<button
							key={team}
							className="button"
							disabled={code.length !== 4}
							onClick={() => {
								location.href = directorPath(code, team);
							}}
						>
							{team}チーム
						</button>
					))}
				</div>
			</section>
		</main>
	);
}
