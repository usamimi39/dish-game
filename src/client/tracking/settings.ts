import { SPONGES } from "../../shared/game";
import { type ColorRange, defaultRanges } from "./color";

export type TrackingSettings = {
	// SPONGES と同じ順番
	ranges: ColorRange[];
	// プレイヤーから見て鏡のように動かす（カメラがプレイヤーの正面にあるとき）
	mirror: boolean;
	deviceId: string | null;
};

// 色の設定はプロジェクター用PCのブラウザにだけ置く（会場の照明に合わせて、その場で調整するもの）
const KEY = "dish-game:tracking";

let current = load();

export function getSettings(): TrackingSettings {
	return current;
}

export function saveSettings(next: TrackingSettings) {
	current = next;
	try {
		localStorage.setItem(KEY, JSON.stringify(next));
	} catch {
		// 保存できなくても、このタブの中では使える
	}
}

export function defaultSettings(): TrackingSettings {
	return { ranges: defaultRanges(), mirror: true, deviceId: null };
}

// 別のタブで /calibrate を開いて調整したら、プレイ画面にもすぐ反映する
window.addEventListener("storage", (event) => {
	if (event.key === KEY) current = load();
});

function load(): TrackingSettings {
	try {
		const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as TrackingSettings | null;
		if (saved && saved.ranges?.length === SPONGES.length) return saved;
	} catch {
		// 壊れていたら初期値に戻す
	}
	return defaultSettings();
}
