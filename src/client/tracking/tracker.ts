import { FRAME_HEIGHT, FRAME_WIDTH, type Detection } from "./detect";
import { getSettings } from "./settings";
import type { TrackRequest, TrackResult } from "./worker";

export type { TrackResult };

// カメラ映像を Worker に渡して、マーカーの位置を受け取り続ける
export class Tracker {
	readonly video = document.createElement("video");
	latest: TrackResult | null = null;

	private worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
	private listeners = new Set<(result: TrackResult) => void>();
	private stream: MediaStream | null = null;
	private running = false;
	// Worker が前のフレームを処理している間は、次のフレームを送らない
	private busy = false;

	constructor() {
		this.video.muted = true;
		this.video.playsInline = true;
		this.worker.onmessage = (event: MessageEvent<TrackResult>) => {
			this.busy = false;
			this.latest = event.data;
			for (const listener of this.listeners) listener(event.data);
		};
	}

	async start(deviceId?: string | null) {
		this.stream?.getTracks().forEach((t) => t.stop());
		this.stream = await navigator.mediaDevices.getUserMedia({
			video: {
				deviceId: deviceId ? { exact: deviceId } : undefined,
				width: { ideal: 1280 },
				height: { ideal: 720 },
			},
			audio: false,
		});
		this.video.srcObject = this.stream;
		await this.video.play();
		if (!this.running) {
			this.running = true;
			requestAnimationFrame(this.loop);
		}
	}

	subscribe(listener: (result: TrackResult) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	destroy() {
		this.running = false;
		this.stream?.getTracks().forEach((t) => t.stop());
		this.worker.terminate();
		this.listeners.clear();
	}

	// 自動露出とホワイトバランスを止めて、色が勝手に変わらないようにする。対応していないカメラもある
	async lockExposure(): Promise<string> {
		const track = this.stream?.getVideoTracks()[0];
		if (!track) return "カメラが動いていません";
		const capabilities = track.getCapabilities() as Record<string, unknown>;
		const constraints: Record<string, string> = {};
		const locked: string[] = [];
		if ((capabilities.exposureMode as string[] | undefined)?.includes("manual")) {
			constraints.exposureMode = "manual";
			locked.push("露出");
		}
		if ((capabilities.whiteBalanceMode as string[] | undefined)?.includes("manual")) {
			constraints.whiteBalanceMode = "manual";
			locked.push("ホワイトバランス");
		}
		if (locked.length === 0) return "このカメラは固定に対応していません";
		await track.applyConstraints({ advanced: [constraints as MediaTrackConstraintSet] });
		return `${locked.join("と")}を固定しました`;
	}

	private loop = async () => {
		if (!this.running) return;
		if (!this.busy && this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
			this.busy = true;
			try {
				const bitmap = await createImageBitmap(this.video, { resizeWidth: FRAME_WIDTH, resizeHeight: FRAME_HEIGHT });
				const request: TrackRequest = { bitmap, ranges: getSettings().ranges };
				this.worker.postMessage(request, [bitmap]);
			} catch {
				this.busy = false;
			}
		}
		requestAnimationFrame(this.loop);
	};
}

// スポンジの色が決まっていればその色、"any" ならいちばん大きく映っている色を使う
export function pickDetection(detections: (Detection | null)[], sponge: number | "any"): Detection | null {
	if (sponge !== "any") return detections[sponge] ?? null;
	let best: Detection | null = null;
	for (const d of detections) if (d && (!best || d.area > best.area)) best = d;
	return best;
}
