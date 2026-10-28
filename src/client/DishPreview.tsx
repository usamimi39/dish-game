import { useEffect, useRef } from "react";
import { createDirt } from "../shared/game";
import { drawDirt, drawPlate } from "./draw";

const SIZE = 360;

// 指示役画面用。汚れの残りを濃さで表す
type Props = { seed: number; kind: number; rimColor: string; remaining: number };

export function DishPreview({ seed, kind, rimColor, remaining }: Props) {
	const ref = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const ctx = ref.current!.getContext("2d")!;
		drawPlate(ctx, SIZE, rimColor);
		ctx.globalAlpha = remaining;
		drawDirt(ctx, SIZE, createDirt(seed, kind));
		ctx.globalAlpha = 1;
	}, [seed, kind, rimColor, remaining]);

	return <canvas ref={ref} width={SIZE} height={SIZE} className="dish-preview" />;
}
