import { SPONGES } from "../shared/game";

// 5色のスポンジ。使い終わった色は Frame 5 の暗い色になる
// 今のターンの色は出さない（実行役は指示役の声だけを頼りにする）
export function SpongeTray({ used }: { used: Set<number> }) {
	return (
		<ol className="sponge-tray">
			{SPONGES.map((sponge, i) => (
				<li
					key={sponge.name}
					className="sponge-slot"
					style={{ background: used.has(i) ? sponge.used : sponge.color }}
					aria-label={sponge.name}
				/>
			))}
		</ol>
	);
}
