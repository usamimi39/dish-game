import { useEffect, useRef, useState } from "react";
import { BODY_PART_LABELS, SPONGES } from "../shared/game";
import { createRoomCode } from "./Home";
import {
	type ColorRange,
	type Hsv,
	hueDistance,
	MAX_TOLERANCE,
	mergeRanges,
	missReason,
	rangeFromSamples,
	rgbToHsv,
} from "./tracking/color";
import { type Detection, FRAME_HEIGHT, FRAME_WIDTH } from "./tracking/detect";
import { defaultSettings, getSettings, saveSettings, type TrackingSettings } from "./tracking/settings";
import { useTracker } from "./tracking/useTracker";

// クリックした点の周り何ピクセルまでを色の見本にするか
const SAMPLE_RADIUS = 3;
// カーソルの下の色を調べるときの範囲
const HOVER_RADIUS = 1;
// マーカーの軌跡を何ミリ秒ぶん残すか
const TRAIL_MS = 1000;

type Registering = { index: number; mode: "replace" | "add" };
type Frame = { detections: (Detection | null)[]; coverage: number[]; fps: number };
type Hover = { hsv: Hsv; rgb: [number, number, number] };
type TrailPoint = { x: number; y: number; t: number };

// カメラ映像を見ながら、マーカーの色の判定範囲を合わせるデバッグ画面
export function Calibrate() {
	const [settings, setSettings] = useState(getSettings);
	const { tracker, error } = useTracker(true, settings.deviceId);
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
	const [registering, setRegistering] = useState<Registering | null>(null);
	const [showMask, setShowMask] = useState(true);
	const [solo, setSolo] = useState<number | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [frame, setFrame] = useState<Frame>({ detections: [], coverage: [], fps: 0 });
	const [hover, setHover] = useState<Hover | null>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const overlayRef = useRef<HTMLCanvasElement>(null);
	// 映像の更新ごとに読むので、再接続しなくていいように ref に入れておく
	const view = useRef({ showMask, solo });
	view.current = { showMask, solo };

	const update = (next: TrackingSettings) => {
		saveSettings(next);
		setSettings(next);
	};
	const updateRange = (index: number, patch: Partial<ColorRange>) =>
		update({ ...settings, ranges: settings.ranges.map((r, i) => (i === index ? { ...r, ...patch } : r)) });

	useEffect(() => {
		if (!tracker) return;
		const stage = stageRef.current!;
		stage.prepend(tracker.video);
		// カメラの許可が出たあとでないと、カメラの名前が取れない
		navigator.mediaDevices
			.enumerateDevices()
			.then((all) => setDevices(all.filter((d) => d.kind === "videoinput")));

		const ctx = overlayRef.current!.getContext("2d")!;
		const trails: TrailPoint[][] = SPONGES.map(() => []);
		const frameTimes: number[] = [];
		const unsubscribe = tracker.subscribe(({ detections, labels, width, height }) => {
			const now = performance.now();
			frameTimes.push(now);
			while (frameTimes[0] < now - 1000) frameTimes.shift();
			detections.forEach((d, i) => {
				if (d) trails[i].push({ x: d.x, y: d.y, t: now });
				while (trails[i].length > 0 && trails[i][0].t < now - TRAIL_MS) trails[i].shift();
			});
			const coverage = drawOverlay(ctx, labels, width, height, detections, trails, view.current);
			setFrame({ detections, coverage, fps: frameTimes.length });
		});
		return () => {
			unsubscribe();
			tracker.video.remove();
		};
	}, [tracker]);

	// 映像の上の位置を、左右反転する前のカメラ映像の位置（0〜1）にする
	const toVideoPoint = (e: React.MouseEvent<HTMLDivElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const x = (e.clientX - rect.left) / rect.width;
		const y = (e.clientY - rect.top) / rect.height;
		return { x: settings.mirror ? 1 - x : x, y };
	};

	const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (registering === null || !tracker) return;
		const { x, y } = toVideoPoint(e);
		const { index, mode } = registering;
		const picked = rangeFromSamples(sampleAround(tracker.video, x, y, SAMPLE_RADIUS));
		const range = mode === "add" ? mergeRanges(settings.ranges[index], picked) : picked;
		updateRange(index, range);
		setMessage(`${colorLabel(index)} を${mode === "add" ? "追加で" : ""}登録しました`);
		// 追加のときは、続けて別の場所もクリックできるようにしておく
		if (mode === "replace") setRegistering(null);
	};

	const onStageMove = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!tracker) return;
		const { x, y } = toVideoPoint(e);
		const samples = sampleAround(tracker.video, x, y, HOVER_RADIUS);
		setHover(averageColor(samples));
	};

	const copySettings = () => {
		const text = JSON.stringify({ ranges: settings.ranges, mirror: settings.mirror });
		navigator.clipboard.writeText(text).then(
			() => setMessage("設定をクリップボードにコピーしました"),
			() => setMessage(text),
		);
	};

	const pasteSettings = () => {
		const text = prompt("コピーした設定を貼り付けてください");
		if (!text) return;
		try {
			const parsed = JSON.parse(text) as Partial<TrackingSettings>;
			if (!Array.isArray(parsed.ranges) || parsed.ranges.length !== SPONGES.length) throw new Error();
			update({ ...settings, ranges: parsed.ranges, mirror: parsed.mirror ?? settings.mirror });
			setMessage("設定を読み込みました");
		} catch {
			setMessage("設定の形がちがうので読み込めませんでした");
		}
	};

	return (
		<main className="calibrate">
			<div className="calibrate-view">
				<div
					ref={stageRef}
					className={["stage", settings.mirror && "stage-mirror", registering !== null && "stage-picking"]
						.filter(Boolean)
						.join(" ")}
					onClick={onStageClick}
					onMouseMove={onStageMove}
					onMouseLeave={() => setHover(null)}
				>
					<canvas ref={overlayRef} width={FRAME_WIDTH} height={FRAME_HEIGHT} className="stage-overlay" />
					{!tracker && <p className="stage-status">{error ? `カメラが使えません: ${error}` : "カメラを準備中…"}</p>}
				</div>
				<p className="calibrate-hint">
					{registering !== null
						? `映像の中の ${colorLabel(registering.index)} のマーカーをクリックしてください${
								registering.mode === "add" ? "（何か所でも続けて足せます。終わったら「やめる」）" : ""
							}`
						: (message ?? "「登録」を押してから映像の中のマーカーをクリックすると、色を登録できます")}
				</p>
				<HoverReadout hover={hover} ranges={settings.ranges} />
				<p className="calibrate-fps">判定 {frame.fps} fps</p>
			</div>

			<aside className="calibrate-panel">
				<h1>カメラの調整</h1>

				<label className="field">
					カメラ
					<select
						value={settings.deviceId ?? ""}
						onChange={(e) => update({ ...settings, deviceId: e.target.value || null })}
					>
						<option value="">いつものカメラ</option>
						{devices.map((d) => (
							<option key={d.deviceId} value={d.deviceId}>
								{d.label || d.deviceId}
							</option>
						))}
					</select>
				</label>
				<label className="check">
					<input
						type="checkbox"
						checked={settings.mirror}
						onChange={(e) => update({ ...settings, mirror: e.target.checked })}
					/>
					左右反転（鏡のように動かす）
				</label>
				<label className="check">
					<input type="checkbox" checked={showMask} onChange={(e) => setShowMask(e.target.checked)} />
					判定した色を映像に重ねる
				</label>
				<div className="calibrate-actions">
					<button
						className="button button-sub button-small"
						onClick={() => tracker?.lockExposure().then(setMessage, (e) => setMessage(String(e)))}
					>
						露出とWBを固定
					</button>
					<button
						className="button button-sub button-small"
						onClick={() => update({ ...defaultSettings(), deviceId: settings.deviceId })}
					>
						初期値に戻す
					</button>
				</div>
				<div className="calibrate-actions">
					<button className="button button-sub button-small" onClick={copySettings}>
						設定をコピー
					</button>
					<button className="button button-sub button-small" onClick={pasteSettings}>
						設定を貼り付け
					</button>
				</div>

				<ul className="ranges">
					{SPONGES.map((sponge, i) => {
						const range = settings.ranges[i];
						const found = frame.detections[i];
						const coverage = frame.coverage[i] ?? 0;
						const isRegistering = registering?.index === i;
						return (
							<li key={sponge.name} className={solo === i ? "range range-solo" : "range"}>
								<div className="range-head">
									<span className="sponge-chip" style={{ background: sponge.color }} />
									<strong>{colorLabel(i)}</strong>
								</div>
								<p className={found ? "range-found" : "range-lost"}>
									{found
										? `見えてる：塊 ${percent(found.area)} ／ 画面全体 ${percent(coverage)}`
										: coverage > 0
											? `小さすぎて無視 ／ 画面全体 ${percent(coverage)}`
											: "見えない"}
								</p>
								<div className="range-actions">
									{isRegistering ? (
										<button className="button button-small" onClick={() => setRegistering(null)}>
											やめる
										</button>
									) : (
										<>
											<button
												className="button button-small button-sub"
												onClick={() => setRegistering({ index: i, mode: "replace" })}
											>
												登録
											</button>
											<button
												className="button button-small button-sub"
												onClick={() => setRegistering({ index: i, mode: "add" })}
											>
												追加で登録
											</button>
										</>
									)}
									<button
										className={solo === i ? "button button-small" : "button button-small button-sub"}
										onClick={() => setSolo(solo === i ? null : i)}
									>
										この色だけ表示
									</button>
								</div>
								<Slider label="色相" value={range.hue} min={0} max={359} step={1} onChange={(hue) => updateRange(i, { hue })} />
								<Slider label="色相の幅" value={range.hueTolerance} min={2} max={MAX_TOLERANCE} step={1} onChange={(hueTolerance) => updateRange(i, { hueTolerance })} />
								<Slider label="彩度の下限" value={range.minSaturation} min={0} max={1} step={0.01} onChange={(minSaturation) => updateRange(i, { minSaturation })} />
								<Slider label="明度の下限" value={range.minValue} min={0} max={1} step={0.01} onChange={(minValue) => updateRange(i, { minValue })} />
							</li>
						);
					})}
				</ul>

				<a className="button" href={`/screen/${createRoomCode()}?input=camera`} target="_blank" rel="noreferrer">
					カメラでプレイ画面を開く
				</a>
			</aside>
		</main>
	);
}

// カーソルの下の色と、どの色に判定されるか（されないならなぜか）を出す
function HoverReadout({ hover, ranges }: { hover: Hover | null; ranges: ColorRange[] }) {
	if (!hover) return <p className="hover-readout hover-empty">映像にカーソルを乗せると、その場所の色を調べられます</p>;
	const { hsv, rgb } = hover;
	const matched = ranges
		.map((range, i) => ({ i, d: hueDistance(hsv.h, range.hue), miss: missReason(hsv, range) }))
		.sort((a, b) => a.d - b.d);
	const hit = matched.find((m) => m.miss === null);
	const nearest = matched[0];

	let verdict: string;
	if (hit) verdict = `→ ${colorLabel(hit.i)} に判定`;
	else {
		const range = ranges[nearest.i];
		const why =
			nearest.miss === "hue"
				? `色相が ${Math.round(nearest.d)}° ずれてる（幅は ${range.hueTolerance}°）`
				: nearest.miss === "saturation"
					? `彩度が足りない（下限 ${range.minSaturation}）`
					: `暗すぎる（下限 ${range.minValue}）`;
		verdict = `→ どの色でもない。いちばん近いのは ${colorLabel(nearest.i)}：${why}`;
	}

	return (
		<p className="hover-readout">
			<span className="sponge-chip" style={{ background: `rgb(${rgb.join(",")})` }} />
			<span className="hover-values">
				色相 {Math.round(hsv.h)}° ／ 彩度 {hsv.s.toFixed(2)} ／ 明度 {hsv.v.toFixed(2)}
			</span>
			<span>{verdict}</span>
		</p>
	);
}

type SliderProps = { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void };

function Slider({ label, value, min, max, step, onChange }: SliderProps) {
	return (
		<label className="slider">
			<span>{label}</span>
			<input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
			<output>{value}</output>
		</label>
	);
}

function colorLabel(index: number): string {
	const sponge = SPONGES[index];
	return `${sponge.name}（${BODY_PART_LABELS[sponge.part]}）`;
}

let sampleCtx: CanvasRenderingContext2D | null = null;

// Worker に渡すのと同じ大きさに縮めてから、クリックした点の周りの色を集める
function sampleAround(video: HTMLVideoElement, x: number, y: number, radius: number): Hsv[] {
	if (!sampleCtx) {
		const canvas = Object.assign(document.createElement("canvas"), { width: FRAME_WIDTH, height: FRAME_HEIGHT });
		sampleCtx = canvas.getContext("2d", { willReadFrequently: true })!;
	}
	sampleCtx.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
	const cx = Math.round(x * (FRAME_WIDTH - 1));
	const cy = Math.round(y * (FRAME_HEIGHT - 1));
	const left = Math.max(0, cx - radius);
	const top = Math.max(0, cy - radius);
	const size = radius * 2 + 1;
	const { data } = sampleCtx.getImageData(left, top, size, size);
	const samples: Hsv[] = [];
	for (let i = 0; i < data.length; i += 4) samples.push(rgbToHsv(data[i], data[i + 1], data[i + 2]));
	return samples;
}

function averageColor(samples: Hsv[]): Hover {
	// 色相は角度なので sin/cos で平均する
	let sin = 0;
	let cos = 0;
	let s = 0;
	let v = 0;
	for (const c of samples) {
		sin += Math.sin((c.h * Math.PI) / 180);
		cos += Math.cos((c.h * Math.PI) / 180);
		s += c.s;
		v += c.v;
	}
	const hsv = { h: ((Math.atan2(sin, cos) * 180) / Math.PI + 360) % 360, s: s / samples.length, v: v / samples.length };
	return { hsv, rgb: hsvToRgb(hsv) };
}

function hsvToRgb({ h, s, v }: Hsv): [number, number, number] {
	const f = (n: number) => {
		const k = (n + h / 60) % 6;
		return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
	};
	return [f(5), f(3), f(1)];
}

function percent(n: number): string {
	return `${(n * 100).toFixed(1)}%`;
}

// 判定した色を重ねて、マーカーの位置と軌跡を描く。色ごとに画面の何割がその色に判定されたかを返す
function drawOverlay(
	ctx: CanvasRenderingContext2D,
	labels: Uint8Array,
	width: number,
	height: number,
	detections: (Detection | null)[],
	trails: TrailPoint[][],
	{ showMask, solo }: { showMask: boolean; solo: number | null },
): number[] {
	ctx.clearRect(0, 0, width, height);
	const counts = SPONGES.map(() => 0);
	const image = ctx.createImageData(width, height);
	const colors = SPONGES.map((s) => Number.parseInt(s.color.slice(1), 16));
	for (let i = 0; i < labels.length; i++) {
		const label = labels[i];
		if (label === 0) continue;
		counts[label - 1]++;
		if (!showMask || (solo !== null && label - 1 !== solo)) continue;
		const c = colors[label - 1];
		image.data[i * 4] = c >> 16;
		image.data[i * 4 + 1] = (c >> 8) & 0xff;
		image.data[i * 4 + 2] = c & 0xff;
		image.data[i * 4 + 3] = 170;
	}
	if (showMask) ctx.putImageData(image, 0, 0);

	detections.forEach((d, i) => {
		if (solo !== null && i !== solo) return;
		const trail = trails[i];
		if (trail.length > 1) {
			ctx.beginPath();
			trail.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x * width, p.y * height) : ctx.lineTo(p.x * width, p.y * height)));
			ctx.lineWidth = 1.5;
			ctx.strokeStyle = SPONGES[i].color;
			ctx.stroke();
		}
		if (!d) return;
		// 塊と同じ面積の円で、どれくらいの大きさで見えているかを示す
		const radius = Math.max(4, Math.sqrt((d.area * width * height) / Math.PI));
		ctx.beginPath();
		ctx.arc(d.x * width, d.y * height, radius, 0, Math.PI * 2);
		ctx.lineWidth = 1.5;
		ctx.strokeStyle = "#ffffff";
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(d.x * width, d.y * height, 3, 0, Math.PI * 2);
		ctx.fillStyle = SPONGES[i].color;
		ctx.fill();
		ctx.stroke();
	});
	return counts.map((c) => c / labels.length);
}
