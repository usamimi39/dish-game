import { SPONGES } from "../shared/game";

// 5色のスポンジ。使い終わった色は Frame 5 の暗い色になり、今のターンの色は大きく出す
export function SpongeTray({ used, current }: { used: Set<number>; current: number }) {
	return (
		<ol className="sponge-tray">
			{SPONGES.map((sponge, i) => (
				<li
					key={sponge.name}
					className={i === current ? "sponge-slot sponge-slot-current" : "sponge-slot"}
					style={{ background: used.has(i) ? sponge.used : sponge.color }}
					aria-label={sponge.name}
				/>
			))}
		</ol>
	);
}
