import { useEffect, useState } from "react";

// プレイ画面を全画面にするボタン。F キーでも切り替えられる。全画面中はボタンを隠す（Esc か F で戻る）
export function FullscreenButton() {
	const [full, setFull] = useState(() => document.fullscreenElement !== null);

	useEffect(() => {
		const onChange = () => setFull(document.fullscreenElement !== null);
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "f" || e.key === "F") toggle();
		};
		document.addEventListener("fullscreenchange", onChange);
		addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("fullscreenchange", onChange);
			removeEventListener("keydown", onKey);
		};
	}, []);

	if (full) return null;
	return (
		<button className="fullscreen-button" onClick={toggle}>
			⛶ 全画面
		</button>
	);
}

function toggle() {
	if (document.fullscreenElement) document.exitFullscreen();
	else document.documentElement.requestFullscreen().catch(() => {});
}
