import { SPONGES } from "../../shared/game";

// 1色ぶんの判定範囲。色相が hue ± hueTolerance の中で、彩度・明度が下限以上なら、その色とみなす
export type ColorRange = {
	hue: number;
	hueTolerance: number;
	minSaturation: number;
	minValue: number;
};

export type Hsv = { h: number; s: number; v: number };

export function rgbToHsv(r: number, g: number, b: number): Hsv {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	let h = 0;
	if (d > 0) {
		if (max === r) h = ((g - b) / d) * 60;
		else if (max === g) h = ((b - r) / d) * 60 + 120;
		else h = ((r - g) / d) * 60 + 240;
		if (h < 0) h += 360;
	}
	return { h, s: max === 0 ? 0 : d / max, v: max / 255 };
}

export function hueDistance(a: number, b: number): number {
	const d = Math.abs(a - b) % 360;
	return d > 180 ? 360 - d : d;
}

// 最初の判定範囲は、スポンジの色（Figma の Frame 4）から作る。実物のマーカーに合わせて /calibrate で直す
export function defaultRanges(): ColorRange[] {
	return SPONGES.map((sponge) => {
		const n = Number.parseInt(sponge.color.slice(1), 16);
		const { h } = rgbToHsv(n >> 16, (n >> 8) & 0xff, n & 0xff);
		return { hue: Math.round(h), hueTolerance: 14, minSaturation: 0.5, minValue: 0.25 };
	});
}

// クリックした周りのピクセルから判定範囲を作る
export function rangeFromSamples(samples: Hsv[]): ColorRange {
	// 色相は 0° と 360° がつながっているので、角度の平均をとる
	let sin = 0;
	let cos = 0;
	for (const { h } of samples) {
		sin += Math.sin((h * Math.PI) / 180);
		cos += Math.cos((h * Math.PI) / 180);
	}
	const hue = ((Math.atan2(sin, cos) * 180) / Math.PI + 360) % 360;
	const spread = Math.max(...samples.map((s) => hueDistance(s.h, hue)));
	const minS = Math.min(...samples.map((s) => s.s));
	const minV = Math.min(...samples.map((s) => s.v));
	return {
		hue: Math.round(hue),
		hueTolerance: Math.round(Math.min(30, Math.max(8, spread + 6))),
		minSaturation: round2(Math.max(0.25, minS * 0.75)),
		minValue: round2(Math.max(0.15, minV * 0.6)),
	};
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

// 今の判定範囲を、新しく登録した範囲も含むように広げる（明るさの違う場所で何回か登録できるように）
export function mergeRanges(a: ColorRange, b: ColorRange): ColorRange {
	// a の色相を 0 としたときの b の色相（-180〜180）
	const offset = ((b.hue - a.hue + 540) % 360) - 180;
	const start = Math.min(-a.hueTolerance, offset - b.hueTolerance);
	const end = Math.max(a.hueTolerance, offset + b.hueTolerance);
	return {
		hue: Math.round((a.hue + (start + end) / 2 + 360) % 360),
		hueTolerance: Math.round(Math.min(MAX_TOLERANCE, (end - start) / 2)),
		minSaturation: Math.min(a.minSaturation, b.minSaturation),
		minValue: Math.min(a.minValue, b.minValue),
	};
}

export const MAX_TOLERANCE = 60;

// その色に判定されない理由。null なら判定される
export type Miss = "hue" | "saturation" | "value" | null;

export function missReason({ h, s, v }: Hsv, range: ColorRange): Miss {
	if (hueDistance(h, range.hue) > range.hueTolerance) return "hue";
	if (s < range.minSaturation) return "saturation";
	if (v < range.minValue) return "value";
	return null;
}
