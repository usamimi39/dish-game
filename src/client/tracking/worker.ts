import type { ColorRange } from "./color";
import { detect, type Detection } from "./detect";

export type TrackRequest = { bitmap: ImageBitmap; ranges: ColorRange[] };
export type TrackResult = { detections: (Detection | null)[]; labels: Uint8Array; width: number; height: number };

// DOM の型で書いているので、Worker として使う分だけ型を付け直す
const scope = self as unknown as {
	onmessage: (event: MessageEvent<TrackRequest>) => void;
	postMessage: (message: TrackResult, transfer: Transferable[]) => void;
};

let ctx: OffscreenCanvasRenderingContext2D | null = null;

scope.onmessage = ({ data: { bitmap, ranges } }) => {
	const { width, height } = bitmap;
	if (!ctx || ctx.canvas.width !== width || ctx.canvas.height !== height) {
		ctx = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true })!;
	}
	ctx.drawImage(bitmap, 0, 0);
	bitmap.close();

	const labels = new Uint8Array(width * height);
	const detections = detect(ctx.getImageData(0, 0, width, height).data, width, height, ranges, labels);
	scope.postMessage({ detections, labels, width, height }, [labels.buffer]);
};
