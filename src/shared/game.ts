// プレイ画面・指示役画面・サーバーで共有するゲームのルールとメッセージの型

export const BODY_PARTS = ["head", "rightHand", "leftHand", "rightFoot", "leftFoot"] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

export const BODY_PART_LABELS: Record<BodyPart, string> = {
	head: "頭",
	rightHand: "右手",
	leftHand: "左手",
	rightFoot: "右足",
	leftFoot: "左足",
};

// スポンジ = 体の部位に付けるマーカー。色と部位は固定で対応している
// color: Figma の Frame 4 / used: 使い終わった色（Frame 5）/ pastel: 皿の縁取り（color に白を 55% 混ぜた色）
// 1枚の皿に1色。一度使った色はもう使えない
export const SPONGES = [
	{ name: "red", part: "head", color: "#ff0000", used: "#8b0000", pastel: "#ff8c8c" },
	{ name: "purple", part: "rightHand", color: "#9500ff", used: "#48007c", pastel: "#cf8cff" },
	{ name: "blue", part: "leftHand", color: "#0d00ff", used: "#06007e", pastel: "#928cff" },
	{ name: "green", part: "rightFoot", color: "#26ff00", used: "#137a01", pastel: "#9dff8c" },
	{ name: "yellow", part: "leftFoot", color: "#ffe600", used: "#7f7200", pastel: "#fff48c" },
] as const satisfies readonly { name: string; part: BodyPart; color: string; used: string; pastel: string }[];

export const DISH_COUNT = SPONGES.length;

// 汚れの残りがこの割合を下回ったらきれいになったとみなす
export const CLEAR_THRESHOLD = 0.03;

export type Dish = {
	// 汚れの種類。数字がそのまま難易度（0 が一番簡単）
	kind: number;
	// SPONGES の番号。使う部位と皿の縁の色もここで決まる
	sponge: number;
};

export type GamePhase = "lobby" | "playing" | "finished";

export type RoomState = {
	phase: GamePhase;
	// 汚れのパターンを決める seed。リセットするまで変わらないので、2チームが同じ汚れで遊べる
	seed: number;
	// 出てくる順に並んだ皿
	dishes: Dish[];
	current: number;
	// 皿ごとの汚れの残り（1 = 最初のまま、0 = きれい）。dishes と同じ順番
	remaining: number[];
	startedAt: number | null;
	finishedAt: number | null;
};

export type ClientMessage =
	| { type: "start" }
	| { type: "progress"; remaining: number }
	| { type: "cleared" }
	// 同じ汚れのまま次のチームへ
	| { type: "next" }
	// 汚れを作り直して新しい試合へ
	| { type: "reset" };

export type ServerMessage = { type: "state"; state: RoomState; now: number };

export function randomSeed(): number {
	return Math.floor(Math.random() * 2 ** 32);
}

export function initialState(seed = randomSeed()): RoomState {
	return {
		phase: "lobby",
		seed,
		dishes: [],
		current: 0,
		remaining: [],
		startedAt: null,
		finishedAt: null,
	};
}

// 皿の順番と使うスポンジ（= 部位）はゲームごとにランダム。スポンジは重複しない
export function createDishes(random: () => number = Math.random): Dish[] {
	const indices = () => Array.from({ length: DISH_COUNT }, (_, i) => i);
	const kinds = shuffle(indices(), random);
	const sponges = shuffle(indices(), random);
	return kinds.map((kind, i) => ({ kind, sponge: sponges[i] }));
}

export type DirtBlob = { x: number; y: number; r: number };

export type DirtPattern = {
	blobs: DirtBlob[];
	// 同じ場所を何回こすれば落ちるかの目安
	toughness: number;
};

// 皿の中心を原点、半径を 1 とした座標で汚れを作る。seed と皿の種類が同じなら必ず同じ形になる
export function createDirt(seed: number, kind: number): DirtPattern {
	const random = mulberry32(seed + kind * 7919);
	const difficulty = kind + 1;
	const blobs: DirtBlob[] = [];
	for (let i = 0; i < 1 + difficulty; i++) {
		const angle = random() * Math.PI * 2;
		const dist = random() * 0.55;
		const cx = Math.cos(angle) * dist;
		const cy = Math.sin(angle) * dist;
		const r = 0.08 + random() * 0.08;
		blobs.push({ x: cx, y: cy, r });
		// 周りに小さい粒をくっつけて、まん丸じゃない汚れにする
		for (let j = 0; j < 4; j++) {
			const a = random() * Math.PI * 2;
			blobs.push({
				x: cx + Math.cos(a) * r * 0.8,
				y: cy + Math.sin(a) * r * 0.8,
				r: r * (0.3 + random() * 0.4),
			});
		}
	}
	return { blobs, toughness: difficulty };
}

function shuffle<T>(items: T[], random: () => number): T[] {
	for (let i = items.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[items[i], items[j]] = [items[j], items[i]];
	}
	return items;
}

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
