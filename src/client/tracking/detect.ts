import { type ColorRange, hueDistance, rgbToHsv } from "./color";

// 判定に使う映像の大きさ。小さいほど速い
export const FRAME_WIDTH = 320;
export const FRAME_HEIGHT = 180;

// これより小さい塊はノイズとして捨てる（ピクセル数）
const MIN_BLOB = 12;

// x, y はカメラ映像の左上を 0、右下を 1 とした位置（左右反転する前）。area は映像全体に対する割合
export type Detection = { x: number; y: number; area: number };

// 色ごとに、いちばん大きい塊の重心を返す。labels には各ピクセルの判定結果（0 = どの色でもない、k + 1 = ranges[k]）が入る
export function detect(
	data: Uint8ClampedArray,
	width: number,
	height: number,
	ranges: ColorRange[],
	labels: Uint8Array,
): (Detection | null)[] {
	const n = width * height;
	for (let i = 0; i < n; i++) {
		labels[i] = classify(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], ranges);
	}

	const visited = new Uint8Array(n);
	const stack = new Int32Array(n);
	const best: (Detection | null)[] = ranges.map(() => null);

	for (let start = 0; start < n; start++) {
		const label = labels[start];
		if (label === 0 || visited[start]) continue;

		// 同じ色でつながっているピクセルを塗りつぶしながら数える
		let top = 0;
		let count = 0;
		let sumX = 0;
		let sumY = 0;
		const push = (q: number) => {
			if (!visited[q] && labels[q] === label) {
				visited[q] = 1;
				stack[top++] = q;
			}
		};
		visited[start] = 1;
		stack[top++] = start;
		while (top > 0) {
			const p = stack[--top];
			const x = p % width;
			const y = (p - x) / width;
			count++;
			sumX += x;
			sumY += y;
			if (x > 0) push(p - 1);
			if (x < width - 1) push(p + 1);
			if (y > 0) push(p - width);
			if (y < height - 1) push(p + width);
		}

		const area = count / n;
		const current = best[label - 1];
		if (count >= MIN_BLOB && (!current || area > current.area)) {
			best[label - 1] = { x: (sumX / count + 0.5) / width, y: (sumY / count + 0.5) / height, area };
		}
	}
	return best;
}

function classify(r: number, g: number, b: number, ranges: ColorRange[]): number {
	const { h, s, v } = rgbToHsv(r, g, b);
	let label = 0;
	let nearest = Number.POSITIVE_INFINITY;
	for (let k = 0; k < ranges.length; k++) {
		const range = ranges[k];
		if (s < range.minSaturation || v < range.minValue) continue;
		const d = hueDistance(h, range.hue);
		if (d <= range.hueTolerance && d < nearest) {
			label = k + 1;
			nearest = d;
		}
	}
	return label;
}
