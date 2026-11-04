import { type ReactNode, useEffect, useRef, useState } from "react";
import { getSettings } from "./tracking/settings";
import { pickDetection, type Tracker } from "./tracking/tracker";

// 画面が出てすぐはボタンを押せない（最後の皿を洗っていた手がたまたま重なって、勝手に進まないように）
const ARM_MS = 1500;
// マーカーをボタンに重ね続けたら押したことにする時間
const DWELL_MS = 2000;
// カーソルのブレを抑える（1 に近いほどなめらかだけど遅れる）
const SMOOTHING = 0.5;

type Props = { tracker: Tracker | null; onActivate: () => void; children: ReactNode; sponge?: number | "any" };

// カメラモードでは、マーカーを重ね続けると押せるボタン（sponge で色を絞れる）。マウスのクリックでも押せる
export function DwellButton({ tracker, onActivate, children, sponge = "any" }: Props) {
	const buttonRef = useRef<HTMLButtonElement>(null);
	const cursorRef = useRef<HTMLDivElement>(null);
	const activate = useRef(onActivate);
	activate.current = onActivate;
	const [progress, setProgress] = useState(0);

	useEffect(() => {
		if (!tracker) return;
		const button = buttonRef.current!;
		const cursor = cursorRef.current!;
		const armedAt = performance.now() + ARM_MS;
		let point: { x: number; y: number } | null = null;
		let enteredAt: number | null = null;
		let done = false;

		return tracker.subscribe(({ detections }) => {
			if (done) return;
			const found = pickDetection(detections, sponge);
			if (!found) {
				point = null;
				enteredAt = null;
				cursor.hidden = true;
				setProgress(0);
				return;
			}
			// カメラ映像の全体を画面の全体に当てはめる（皿のときと同じ向き）
			const target = {
				x: (getSettings().mirror ? 1 - found.x : found.x) * innerWidth,
				y: found.y * innerHeight,
			};
			point = point
				? { x: point.x + (target.x - point.x) * (1 - SMOOTHING), y: point.y + (target.y - point.y) * (1 - SMOOTHING) }
				: target;
			cursor.hidden = false;
			cursor.style.left = `${point.x}px`;
			cursor.style.top = `${point.y}px`;

			const now = performance.now();
			const rect = button.getBoundingClientRect();
			const inside = point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
			if (!inside || now < armedAt) {
				enteredAt = null;
				setProgress(0);
				return;
			}
			enteredAt ??= now;
			const p = Math.min(1, (now - enteredAt) / DWELL_MS);
			setProgress(p);
			if (p >= 1) {
				done = true;
				cursor.hidden = true;
				activate.current();
			}
		});
	}, [tracker, sponge]);

	return (
		<>
			<button
				ref={buttonRef}
				className="button dwell-button"
				style={{ "--progress": progress } as React.CSSProperties}
				onClick={() => activate.current()}
			>
				{children}
			</button>
			{tracker && <div ref={cursorRef} className="dwell-cursor" hidden />}
		</>
	);
}
