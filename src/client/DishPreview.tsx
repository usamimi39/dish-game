import { useEffect, useRef } from "react";
import { createDirt } from "../shared/game";
import { drawDirt, drawPlate } from "./draw";

const SIZE = 360;

// 指示役画面用。汚れの残りを濃さで表す
export function DishPreview({ seed, kind, remaining }: { seed: number; kind: number; remaining: number }) {
	const ref = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const ctx = ref.current!.getContext("2d")!;
		drawPlate(ctx, SIZE, kind);
		ctx.globalAlpha = remaining;
		drawDirt(ctx, SIZE, createDirt(seed, kind));
		ctx.globalAlpha = 1;
	}, [seed, kind, remaining]);

	return <canvas ref={ref} width={SIZE} height={SIZE} className="dish-preview" />;
}
