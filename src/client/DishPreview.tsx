import { useEffect, useRef } from "react";
import { createDirt, type DirtSpec } from "../shared/game";
import { drawDirt, drawPlate, PLATE_RIM } from "./draw";

const SIZE = 360;

type Props = { dirt: DirtSpec; remaining: number; className?: string };

// 指示役画面用。汚れの残りを濃さで表す
export function DishPreview({ dirt: { seed, spread, distance, rotation }, remaining, className }: Props) {
	const ref = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const ctx = ref.current!.getContext("2d")!;
		drawPlate(ctx, SIZE, PLATE_RIM);
		ctx.globalAlpha = remaining;
		drawDirt(ctx, SIZE, createDirt({ seed, spread, distance, rotation }));
		ctx.globalAlpha = 1;
	}, [seed, spread, distance, rotation, remaining]);

	return <canvas ref={ref} width={SIZE} height={SIZE} className={className ?? "dish-preview"} />;
}
