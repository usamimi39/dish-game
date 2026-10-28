import { DISH_KINDS, type DirtPattern } from "../shared/game";

// 皿の内側（汚れが付く範囲）の半径。皿全体の半径に対する割合
const INNER = 0.8;

export function drawPlate(ctx: CanvasRenderingContext2D, size: number, kind: number) {
	const c = size / 2;
	const r = c * 0.98;
	ctx.clearRect(0, 0, size, size);
	circle(ctx, c, c, r);
	ctx.fillStyle = DISH_KINDS[kind].rim;
	ctx.fill();
	circle(ctx, c, c, r * 0.93);
	ctx.fillStyle = "#ffffff";
	ctx.fill();
	circle(ctx, c, c, r * INNER);
	ctx.strokeStyle = "#cfcfcf";
	ctx.lineWidth = size * 0.012;
	ctx.stroke();
}

export function drawDirt(ctx: CanvasRenderingContext2D, size: number, pattern: DirtPattern) {
	const c = size / 2;
	const scale = c * INNER;
	ctx.fillStyle = "#a8743f";
	for (const blob of pattern.blobs) {
		circle(ctx, c + blob.x * scale, c + blob.y * scale, blob.r * scale);
		ctx.fill();
	}
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
}
