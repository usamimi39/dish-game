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
// color: Figma の Frame 4 / used: 使い終わった色（Frame 5）/ pastel: color に白を 55% 混ぜた色（皿の縁取り）
// 5枚の皿に5つの部位を1つずつ割り当てる（指示役がセッティングで並べ替える）
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

// 指示役が皿を回したり部位を並べ替えたりできる時間。時間切れでその時の状態に決まる
export const SETUP_SECONDS = 15;

// 汚れは「拡散度 3 段階 × 中心からの距離 3 段階」の 9 パターン。そこから 5 つを選んで使う
export const SPREAD_LEVELS = 3;
export const DISTANCE_LEVELS = 3;

export type Dish = {
	// 拡散度（0 = 1か所にまとまっている … 2 = 縁に沿って三日月のように広がる）
	spread: number;
	// 汚れが皿の中心からどれだけ離れているか（0 = 中心の少し外 … 2 = 縁）。どれも片側に寄るので、回す意味がある
	distance: number;
	// 汚れの細かい形を決める seed
	seed: number;
	// 時計回りに 90° を何回まわしたか（0〜3）。指示役がセッティングで変える
	rotation: number;
	// この皿を洗うスポンジ（= 部位）。5枚で全部違う。指示役がセッティングで入れ替える
	sponge: number;
};

// 1ゲーム = A チームの 5 皿 → B チームの 5 皿。タイムが短いほうの勝ち
export const TEAMS = ["A", "B"] as const;
export type Team = (typeof TEAMS)[number];

// lobby → setup（指示役が皿を回して、部位を割り当てる）→ playing（5ターン）→ finished
export type GamePhase = "lobby" | "setup" | "playing" | "finished";

export type RoomState = {
	// 今プレイしているチーム。指示役の操作は、このチームの指示役からだけ受け付ける
	team: Team;
	phase: GamePhase;
	// 出てくる順に並んだ皿
	dishes: Dish[];
	current: number;
	// 皿ごとの汚れの残り（1 = 最初のまま、0 = きれい）。dishes と同じ順番
	remaining: number[];
	setupEndsAt: number | null;
	startedAt: number | null;
	finishedAt: number | null;
	// チームごとのタイム（ms）。まだ遊んでいなければ null
	results: Record<Team, number | null>;
};

export type ClientMessage =
	// プレイ画面から
	| { type: "start" }
	| { type: "progress"; remaining: number }
	| { type: "cleared" }
	// A チームが終わったあとに B チームの番にする
	| { type: "next" }
	// ゲームを最初（A チームの lobby）からやり直す
	| { type: "reset" }
	// 指示役から
	| { type: "rotate"; dish: number; direction: 1 | -1 }
	// 2枚の皿の部位を入れ替える
	| { type: "swap"; a: number; b: number };

export type ServerMessage = { type: "state"; state: RoomState; now: number };

export function initialState(): RoomState {
	return {
		team: "A",
		phase: "lobby",
		dishes: [],
		current: 0,
		remaining: [],
		setupEndsAt: null,
		startedAt: null,
		finishedAt: null,
		results: { A: null, B: null },
	};
}

// 指示役の URL は /director/<ルーム>-<チーム>（例: /director/K7QM-A）
export function directorPath(room: string, team: Team): string {
	return `/director/${room}-${team}`;
}

export function parseDirectorRoom(value: string): { room: string; team: Team | null } {
	const match = /^(.+)-([AB])$/i.exec(value);
	if (!match) return { room: value, team: null };
	return { room: match[1], team: match[2].toUpperCase() as Team };
}

// どちらのチームが勝ったか。両方終わるまでは null、同じタイムなら "draw"
export function winner(results: Record<Team, number | null>): Team | "draw" | null {
	const { A, B } = results;
	if (A === null || B === null) return null;
	if (A === B) return "draw";
	return A < B ? "A" : "B";
}

// 9 パターンから 5 つ選ぶ。順番も初期の向きも部位の割り当てもランダム。チームごとに作り直すので、2チームで違う皿になる
export function createDishes(random: () => number = Math.random): Dish[] {
	const sponges = shuffle(
		SPONGES.map((_, i) => i),
		random,
	);
	const types: { spread: number; distance: number }[] = [];
	for (let spread = 0; spread < SPREAD_LEVELS; spread++) {
		for (let distance = 0; distance < DISTANCE_LEVELS; distance++) types.push({ spread, distance });
	}
	return shuffle(types, random)
		.slice(0, DISH_COUNT)
		.map((type, i) => ({
			...type,
			seed: Math.floor(random() * 2 ** 32),
			rotation: Math.floor(random() * 4),
			sponge: sponges[i],
		}));
}

export type DirtBlob = { x: number; y: number; r: number };

export type DirtPattern = {
	blobs: DirtBlob[];
	// 同じ場所を何回こすれば落ちるかの目安
	toughness: number;
};

export type DirtSpec = Pick<Dish, "seed" | "spread" | "distance" | "rotation">;

// 拡散度ごとの「汚れが並ぶ弧の広さ（片側の角度・ラジアン）」「弧からのばらつき」「かたまりの数」「かたまりの大きさ」
// どの拡散度でも汚れは皿の片側に寄せる。真ん中にまとまった汚れは、回しても同じなので作らない
// 拡散度が大きいほど、汚れは三日月のように縁に沿って広がる
const SPREADS = [
	{ arc: 0, jitter: 0.08, count: 3, size: [0.14, 0.2] },
	{ arc: 0.6, jitter: 0.08, count: 6, size: [0.08, 0.13] },
	{ arc: 1.2, jitter: 0.1, count: 11, size: [0.05, 0.08] },
] as const;

// 距離ごとの、汚れが並ぶ弧と皿の中心との距離。いちばん近くても中心から外す
const DISTANCES = [0.3, 0.5, 0.7];

// 皿の中心を原点、内側の半径を 1、下向きを y+ とした座標で汚れを作る。同じ spec なら必ず同じ形になる
// 回転 0 のとき、汚れは皿の上側に寄る
export function createDirt({ seed, spread, distance, rotation }: DirtSpec): DirtPattern {
	const random = mulberry32(seed);
	const { arc, jitter, count, size } = SPREADS[spread];
	// 真上から少しだけずらして、毎回同じ見た目にならないようにする
	const angle = -Math.PI / 2 + (random() - 0.5) * 0.5;
	const reach = DISTANCES[distance];

	const blobs: DirtBlob[] = [];
	for (let i = 0; i < count; i++) {
		// 弧の上のどこか + 少しのばらつき
		const a = angle + (random() * 2 - 1) * arc;
		const ja = random() * Math.PI * 2;
		const jd = Math.sqrt(random()) * jitter;
		const r = size[0] + random() * (size[1] - size[0]);
		const x = Math.cos(a) * reach + Math.cos(ja) * jd;
		const y = Math.sin(a) * reach + Math.sin(ja) * jd;
		blobs.push(...lump(x, y, r, random));
	}
	return { blobs: blobs.map((b) => rotate(fitInside(b), rotation)), toughness: 2 };
}

// 周りに小さい粒をくっつけて、まん丸じゃない汚れにする
function lump(x: number, y: number, r: number, random: () => number): DirtBlob[] {
	const blobs = [{ x, y, r }];
	for (let j = 0; j < 4; j++) {
		const a = random() * Math.PI * 2;
		blobs.push({ x: x + Math.cos(a) * r * 0.8, y: y + Math.sin(a) * r * 0.8, r: r * (0.3 + random() * 0.4) });
	}
	return blobs;
}

// 皿の内側からはみ出す粒は、中心に向かって押し戻す
function fitInside(blob: DirtBlob): DirtBlob {
	const d = Math.hypot(blob.x, blob.y);
	const max = 1 - blob.r;
	if (d <= max) return blob;
	return { ...blob, x: (blob.x / d) * max, y: (blob.y / d) * max };
}

// 時計回りに 90° × times まわす（画面の座標は y が下向き）
function rotate(blob: DirtBlob, times: number): DirtBlob {
	let { x, y } = blob;
	for (let i = 0; i < ((times % 4) + 4) % 4; i++) [x, y] = [-y, x];
	return { ...blob, x, y };
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
