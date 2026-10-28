import { useEffect, useRef, useState } from "react";
import { BODY_PART_LABELS, SPONGES } from "../shared/game";
import { createRoomCode } from "./Home";
import { type ColorRange, type Hsv, rangeFromSamples, rgbToHsv } from "./tracking/color";
import { type Detection, FRAME_HEIGHT, FRAME_WIDTH } from "./tracking/detect";
import { defaultSettings, getSettings, saveSettings, type TrackingSettings } from "./tracking/settings";
import { useTracker } from "./tracking/useTracker";

// クリックした点の周り何ピクセルまでを色の見本にするか
const SAMPLE_RADIUS = 3;

// カメラ映像を見ながら、マーカーの色の判定範囲を合わせる画面
export function Calibrate() {
	const [settings, setSettings] = useState(getSettings);
	const { tracker, error } = useTracker(true, settings.deviceId);
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
	const [registering, setRegistering] = useState<number | null>(null);
	const [showMask, setShowMask] = useState(true);
	const [message, setMessage] = useState<string | null>(null);
	const [detections, setDetections] = useState<(Detection | null)[]>([]);
	const stageRef = useRef<HTMLDivElement>(null);
	const overlayRef = useRef<HTMLCanvasElement>(null);
	const showMaskRef = useRef(showMask);
	showMaskRef.current = showMask;

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
		const unsubscribe = tracker.subscribe(({ detections, labels, width, height }) => {
			drawOverlay(ctx, labels, width, height, detections, showMaskRef.current);
			setDetections(detections);
		});
		return () => {
			unsubscribe();
			tracker.video.remove();
		};
	}, [tracker]);

	const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (registering === null || !tracker) return;
		const rect = e.currentTarget.getBoundingClientRect();
		let x = (e.clientX - rect.left) / rect.width;
		const y = (e.clientY - rect.top) / rect.height;
		if (settings.mirror) x = 1 - x;

		const range = rangeFromSamples(sampleAround(tracker.video, x, y));
		updateRange(registering, range);
		setMessage(`${colorLabel(registering)} を登録しました`);
		setRegistering(null);
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
				>
					<canvas ref={overlayRef} width={FRAME_WIDTH} height={FRAME_HEIGHT} className="stage-overlay" />
					{!tracker && <p className="stage-status">{error ? `カメラが使えません: ${error}` : "カメラを準備中…"}</p>}
				</div>
				<p className="calibrate-hint">
					{registering !== null
						? `映像の中の ${colorLabel(registering)} のマーカーをクリックしてください`
						: (message ?? "「クリックで登録」を押してから、映像の中のマーカーをクリックすると色を登録できます")}
				</p>
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
						className="button button-sub"
						onClick={() => tracker?.lockExposure().then(setMessage, (e) => setMessage(String(e)))}
					>
						露出とWBを固定
					</button>
					<button
						className="button button-sub"
						onClick={() => update({ ...defaultSettings(), deviceId: settings.deviceId })}
					>
						初期値に戻す
					</button>
				</div>

				<ul className="ranges">
					{SPONGES.map((sponge, i) => {
						const range = settings.ranges[i];
						const found = detections[i];
						return (
							<li key={sponge.name} className="range">
								<div className="range-head">
									<span className="sponge-chip" style={{ background: sponge.color }} />
									<strong>{colorLabel(i)}</strong>
									<span className={found ? "range-found" : "range-lost"}>
										{found ? `見えてる ${(found.area * 100).toFixed(1)}%` : "見えない"}
									</span>
									<button
										className={registering === i ? "button button-small" : "button button-small button-sub"}
										onClick={() => setRegistering(registering === i ? null : i)}
									>
										{registering === i ? "やめる" : "クリックで登録"}
									</button>
								</div>
								<Slider label="色相" value={range.hue} min={0} max={359} step={1} onChange={(hue) => updateRange(i, { hue })} />
								<Slider label="色相の幅" value={range.hueTolerance} min={2} max={40} step={1} onChange={(hueTolerance) => updateRange(i, { hueTolerance })} />
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
function sampleAround(video: HTMLVideoElement, x: number, y: number): Hsv[] {
	if (!sampleCtx) {
		const canvas = Object.assign(document.createElement("canvas"), { width: FRAME_WIDTH, height: FRAME_HEIGHT });
		sampleCtx = canvas.getContext("2d", { willReadFrequently: true })!;
	}
	sampleCtx.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
	const cx = Math.round(x * (FRAME_WIDTH - 1));
	const cy = Math.round(y * (FRAME_HEIGHT - 1));
	const left = Math.max(0, cx - SAMPLE_RADIUS);
	const top = Math.max(0, cy - SAMPLE_RADIUS);
	const size = SAMPLE_RADIUS * 2 + 1;
	const { data } = sampleCtx.getImageData(left, top, size, size);
	const samples: Hsv[] = [];
	for (let i = 0; i < data.length; i += 4) samples.push(rgbToHsv(data[i], data[i + 1], data[i + 2]));
	return samples;
}

function drawOverlay(
	ctx: CanvasRenderingContext2D,
	labels: Uint8Array,
	width: number,
	height: number,
	detections: (Detection | null)[],
	showMask: boolean,
) {
	ctx.clearRect(0, 0, width, height);
	if (showMask) {
		const image = ctx.createImageData(width, height);
		const colors = SPONGES.map((s) => Number.parseInt(s.color.slice(1), 16));
		for (let i = 0; i < labels.length; i++) {
			if (labels[i] === 0) continue;
			const c = colors[labels[i] - 1];
			image.data[i * 4] = c >> 16;
			image.data[i * 4 + 1] = (c >> 8) & 0xff;
			image.data[i * 4 + 2] = c & 0xff;
			image.data[i * 4 + 3] = 170;
		}
		ctx.putImageData(image, 0, 0);
	}
	detections.forEach((d, i) => {
		if (!d) return;
		ctx.beginPath();
		ctx.arc(d.x * width, d.y * height, 6, 0, Math.PI * 2);
		ctx.fillStyle = SPONGES[i].color;
		ctx.fill();
		ctx.lineWidth = 2;
		ctx.strokeStyle = "#ffffff";
		ctx.stroke();
	});
}
