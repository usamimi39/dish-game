import { useEffect, useRef } from "react";
import { CLEAR_THRESHOLD, createDirt } from "../shared/game";
import { drawDirt, drawPlate } from "./draw";

const SIZE = 720;
const SPONGE_WIDTH = SIZE * 0.12;
const PROGRESS_INTERVAL_MS = 200;

type Props = {
	seed: number;
	kind: number;
	onProgress?: (remaining: number) => void;
	onCleared: () => void;
};

// ポインターでなぞった所の汚れを消す皿。あとでマウスを色マーカーの位置に置き換える
export function DishCanvas({ seed, kind, onProgress, onCleared }: Props) {
	const plateRef = useRef<HTMLCanvasElement>(null);
	const dirtRef = useRef<HTMLCanvasElement>(null);
	const callbacks = useRef({ onProgress, onCleared });
	callbacks.current = { onProgress, onCleared };

	useEffect(() => {
		const plate = plateRef.current!;
		const dirt = dirtRef.current!;
		const ctx = dirt.getContext("2d", { willReadFrequently: true })!;
		const pattern = createDirt(seed, kind);

		drawPlate(plate.getContext("2d")!, SIZE, kind);
		ctx.clearRect(0, 0, SIZE, SIZE);
		drawDirt(ctx, SIZE, pattern);
		const initial = alphaSum(ctx);

		// 頑固な汚れほど一回でこすれる量が少ない
		const strength = 0.5 / pattern.toughness;
		let last: { x: number; y: number } | null = null;
		let changed = false;
		let cleared = false;

		const toCanvas = (e: PointerEvent) => {
			const rect = dirt.getBoundingClientRect();
			return {
				x: ((e.clientX - rect.left) / rect.width) * SIZE,
				y: ((e.clientY - rect.top) / rect.height) * SIZE,
			};
		};

		const onMove = (e: PointerEvent) => {
			const point = toCanvas(e);
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
		const onLeave = () => {
			last = null;
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

		dirt.addEventListener("pointermove", onMove);
		dirt.addEventListener("pointerleave", onLeave);
		return () => {
			clearInterval(timer);
			dirt.removeEventListener("pointermove", onMove);
			dirt.removeEventListener("pointerleave", onLeave);
		};
	}, [seed, kind]);

	return (
		<div className="dish">
			<canvas ref={plateRef} width={SIZE} height={SIZE} />
			<canvas ref={dirtRef} width={SIZE} height={SIZE} />
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
