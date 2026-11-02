import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { parseDirectorRoom } from "../shared/game";
import { Calibrate } from "./Calibrate";
import { Director } from "./Director";
import { Home } from "./Home";
import { Screen } from "./Screen";
import "./styles.css";

// 画面は数えるほどしかないのでルーターは使わない
function App() {
	const [, page, room] = location.pathname.split("/");
	if (page === "calibrate") return <Calibrate />;
	if (page === "screen" && room) return <Screen room={room} />;
	if (page === "director" && room) {
		const parsed = parseDirectorRoom(room);
		return <Director room={parsed.room} team={parsed.team} />;
	}
	return <Home />;
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
