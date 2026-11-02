import { useEffect, useRef } from "react";
import { CLEAR_THRESHOLD, createDirt, type DirtSpec } from "../shared/game";
import { drawDirt, drawPlate, PLATE_RIM } from "./draw";
import { getSettings } from "./tracking/settings";
import { pickDetection, type Tracker } from "./tracking/tracker";

const SIZE = 720;
const SPONGE_WIDTH = SIZE * 0.12;
const PROGRESS_INTERVAL_MS = 200;
// カメラの位置がこれ以上一気に飛んだら、線でつながずに新しくこすり始めたことにする（誤検出で長い線が引かれないように）
const MAX_JUMP = SIZE * 0.3;
// カメラの位置のブレを抑える（1 に近いほどなめらかだけど遅れる）
const SMOOTHING = 0.4;

// マウスで消すか、カメラに映ったマーカーで消すか、消せないか。sponge が "any" ならどの色のマーカーでも消せる
export type DishInput =
	| { type: "none" }
	| { type: "mouse" }
	| { type: "camera"; tracker: Tracker; sponge: number | "any" };

type Point = { x: number; y: number };

type Eraser = {
	moveTo: (point: Point, smoothing?: number) => void;
	leave: () => void;
};

type Props = {
	dirt: DirtSpec;
	rim?: string;
	spongeColor: string;
	input: DishInput;
	onProgress?: (remaining: number) => void;
	onCleared: () => void;
};

// なぞった所の汚れを消す皿
export function DishCanvas({ dirt: spec, rim = PLATE_RIM, spongeColor, input, onProgress, onCleared }: Props) {
	const plateRef = useRef<HTMLCanvasElement>(null);
	const dirtRef = useRef<HTMLCanvasElement>(null);
	const spongeRef = useRef<HTMLDivElement>(null);
	const eraserRef = useRef<Eraser | null>(null);
	const callbacks = useRef({ onProgress, onCleared });
	callbacks.current = { onProgress, onCleared };
	const { seed, spread, distance, rotation } = spec;

	// 汚れを描いて、消す処理を用意する。入力が変わっても描き直さない
	useEffect(() => {
		const dirt = dirtRef.current!;
		const sponge = spongeRef.current!;
		const ctx = dirt.getContext("2d", { willReadFrequently: true })!;
		const pattern = createDirt({ seed, spread, distance, rotation });

		drawPlate(plateRef.current!.getContext("2d")!, SIZE, rim);
		ctx.clearRect(0, 0, SIZE, SIZE);
		drawDirt(ctx, SIZE, pattern);
		const initial = alphaSum(ctx);

		// 頑固な汚れほど一回でこすれる量が少ない
		const strength = 0.5 / pattern.toughness;
		let last: Point | null = null;
		let changed = false;
		let cleared = false;

		const leave = () => {
			last = null;
			sponge.hidden = true;
		};

		const moveTo = (target: Point, smoothing = 0) => {
			if (last && Math.hypot(target.x - last.x, target.y - last.y) > MAX_JUMP) last = null;
			const point = last
				? { x: last.x + (target.x - last.x) * (1 - smoothing), y: last.y + (target.y - last.y) * (1 - smoothing) }
				: target;
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

		eraserRef.current = { moveTo, leave };

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

		return () => {
			clearInterval(timer);
			eraserRef.current = null;
		};
	}, [seed, spread, distance, rotation, rim]);

	const tracker = input.type === "camera" ? input.tracker : null;
	const trackedSponge = input.type === "camera" ? input.sponge : null;
	const mouse = input.type === "mouse";

	// 入力をつなぐ
	useEffect(() => {
		const dirt = dirtRef.current!;
		const eraser = () => eraserRef.current;

		if (tracker && trackedSponge !== null) {
			// カメラ映像の全体を皿の全体に当てはめる
			return tracker.subscribe(({ detections }) => {
				const found = pickDetection(detections, trackedSponge);
				if (!found) return eraser()?.leave();
				const x = (getSettings().mirror ? 1 - found.x : found.x) * SIZE;
				eraser()?.moveTo({ x, y: found.y * SIZE }, SMOOTHING);
			});
		}

		if (mouse) {
			const onPointerMove = (e: PointerEvent) => {
				const rect = dirt.getBoundingClientRect();
				eraser()?.moveTo({
					x: ((e.clientX - rect.left) / rect.width) * SIZE,
					y: ((e.clientY - rect.top) / rect.height) * SIZE,
				});
			};
			const onPointerLeave = () => eraser()?.leave();
			dirt.addEventListener("pointermove", onPointerMove);
			dirt.addEventListener("pointerleave", onPointerLeave);
			return () => {
				dirt.removeEventListener("pointermove", onPointerMove);
				dirt.removeEventListener("pointerleave", onPointerLeave);
			};
		}

		eraser()?.leave();
	}, [tracker, trackedSponge, mouse]);

	return (
		<div className={mouse ? "dish dish-mouse" : "dish"}>
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
