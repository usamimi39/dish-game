import { useMemo } from "react";
import { encode } from "uqr";

// 白い余白（クワイエットゾーン）は QR の仕様で 4 マス必要。読み取りやすさのため削らない
const QUIET_ZONE = 4;

// URL を QR コードの SVG にする。黒いマスを 1 本のパスにまとめて描く
export function QrCode({ value, className }: { value: string; className?: string }) {
	const { size, path } = useMemo(() => {
		const { data, size } = encode(value, { ecc: "M", border: QUIET_ZONE });
		let path = "";
		data.forEach((row, y) => {
			row.forEach((dark, x) => {
				if (dark) path += `M${x} ${y}h1v1h-1z`;
			});
		});
		return { size, path };
	}, [value]);

	return (
		<svg
			className={className}
			viewBox={`0 0 ${size} ${size}`}
			shapeRendering="crispEdges"
			role="img"
			aria-label={`QR コード: ${value}`}
		>
			<rect width={size} height={size} fill="#fff" />
			<path d={path} fill="#000" />
		</svg>
	);
}
