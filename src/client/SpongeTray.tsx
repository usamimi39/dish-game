import { type Dish, SPONGES } from "../shared/game";

// 使う順に並べたスポンジ。使い終わった色は Frame 5 の暗い色になる
export function SpongeTray({ dishes, current }: { dishes: Dish[]; current: number }) {
	return (
		<ol className="sponge-tray">
			{dishes.map((dish, i) => {
				const sponge = SPONGES[dish.sponge];
				return (
					<li
						key={sponge.name}
						className={i === current ? "sponge-slot sponge-slot-current" : "sponge-slot"}
						style={{ background: i < current ? sponge.used : sponge.color }}
						aria-label={sponge.name}
					/>
				);
			})}
		</ol>
	);
}
