import { useEffect, useRef } from "react";
import { CLEAR_THRESHOLD, createDirt } from "../shared/game";
import { drawDirt, drawPlate } from "./draw";
import { getSettings } from "./tracking/settings";
import { pickDetection, type Tracker } from "./tracking/tracker";

const SIZE = 720;
const SPONGE_WIDTH = SIZE * 0.12;
const PROGRESS_INTERVAL_MS = 200;
// カメラの位置がこれ以上一気に飛んだら、線でつながずに新しくこすり始めたことにする（誤検出で長い線が引かれないように）
const MAX_JUMP = SIZE * 0.3;
// カメラの位置のブレを抑える（1 に近いほどなめらかだけど遅れる）
const SMOOTHING = 0.4;

// マウスで消すか、カメラに映ったマーカーで消すか。sponge が "any" ならどの色のマーカーでも消せる
export type DishInput = { type: "mouse" } | { type: "camera"; tracker: Tracker; sponge: number | "any" };

type Props = {
	seed: number;
	kind: number;
	spongeColor: string;
	rimColor: string;
	input: DishInput;
	onProgress?: (remaining: number) => void;
	onCleared: () => void;
};

// なぞった所の汚れを消す皿
export function DishCanvas({ seed, kind, spongeColor, rimColor, input, onProgress, onCleared }: Props) {
	const plateRef = useRef<HTMLCanvasElement>(null);
	const dirtRef = useRef<HTMLCanvasElement>(null);
	const spongeRef = useRef<HTMLDivElement>(null);
	const callbacks = useRef({ onProgress, onCleared });
	callbacks.current = { onProgress, onCleared };
	const tracker = input.type === "camera" ? input.tracker : null;
	const trackedSponge = input.type === "camera" ? input.sponge : null;

	useEffect(() => {
		const plate = plateRef.current!;
		const dirt = dirtRef.current!;
		const sponge = spongeRef.current!;
		const ctx = dirt.getContext("2d", { willReadFrequently: true })!;
		const pattern = createDirt(seed, kind);

		drawPlate(plate.getContext("2d")!, SIZE, rimColor);
		ctx.clearRect(0, 0, SIZE, SIZE);
		drawDirt(ctx, SIZE, pattern);
		const initial = alphaSum(ctx);

		// 頑固な汚れほど一回でこすれる量が少ない
		const strength = 0.5 / pattern.toughness;
		let last: { x: number; y: number } | null = null;
		let changed = false;
		let cleared = false;

		const moveTo = (point: { x: number; y: number }) => {
			// 再レンダーせずに動かしたいので、スタイルを直接書き換える
			sponge.style.left = `${(point.x / SIZE) * 100}%`;
			sponge.style.top = `${(point.y / SIZE) * 100}%`;
			sponge.hidden = false;
			if (last) {
				ctx.save();
				ctx.globalCompositeOperation = "destination-out";
				ctx.globalAlpha = strength;
				ctx.lineWidth = SPONGE_WIDTH;
				ctx.lineCap = "round";
				ctx.beginPath();
				ctx.moveTo(last.x, last.y);
				ctx.lineTo(point.x, point.y);
				ctx.stroke();
				ctx.restore();
				changed = true;
			}
			last = point;
		};
		const leave = () => {
			last = null;
			sponge.hidden = true;
		};

		const onPointerMove = (e: PointerEvent) => {
			const rect = dirt.getBoundingClientRect();
			moveTo({
				x: ((e.clientX - rect.left) / rect.width) * SIZE,
				y: ((e.clientY - rect.top) / rect.height) * SIZE,
			});
		};

		// カメラ映像の全体を皿の全体に当てはめる
		const onTrack = (detections: Parameters<typeof pickDetection>[0]) => {
			const found = pickDetection(detections, trackedSponge ?? "any");
			if (!found) return leave();
			const x = (getSettings().mirror ? 1 - found.x : found.x) * SIZE;
			const y = found.y * SIZE;
			if (last && Math.hypot(x - last.x, y - last.y) > MAX_JUMP) last = null;
			moveTo(last ? { x: last.x + (x - last.x) * (1 - SMOOTHING), y: last.y + (y - last.y) * (1 - SMOOTHING) } : { x, y });
		};

		const timer = setInterval(() => {
			if (!changed || cleared) return;
			changed = false;
			const remaining = alphaSum(ctx) / initial;
			callbacks.current.onProgress?.(remaining);
			if (remaining < CLEAR_THRESHOLD) {
				cleared = true;
				callbacks.current.onCleared();
			}
		}, PROGRESS_INTERVAL_MS);

		if (tracker) {
			const unsubscribe = tracker.subscribe((result) => onTrack(result.detections));
			return () => {
				clearInterval(timer);
				unsubscribe();
			};
		}
		dirt.addEventListener("pointermove", onPointerMove);
		dirt.addEventListener("pointerleave", leave);
		return () => {
			clearInterval(timer);
			dirt.removeEventListener("pointermove", onPointerMove);
			dirt.removeEventListener("pointerleave", leave);
		};
	}, [seed, kind, rimColor, tracker, trackedSponge]);

	return (
		<div className="dish">
			<canvas ref={plateRef} width={SIZE} height={SIZE} />
			<canvas ref={dirtRef} width={SIZE} height={SIZE} />
			<div
				ref={spongeRef}
				className="sponge"
				hidden
				style={{ width: `${(SPONGE_WIDTH / SIZE) * 100}%`, background: spongeColor }}
			/>
		</div>
	);
}

function alphaSum(ctx: CanvasRenderingContext2D): number {
	const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
	let sum = 0;
	// 全部のピクセルを見る必要はないので、4ピクセルおきに見る
	for (let i = 3; i < data.length; i += 16) sum += data[i];
	return sum;
}
