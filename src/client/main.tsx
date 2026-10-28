import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Director } from "./Director";
import { Home } from "./Home";
import { Screen } from "./Screen";
import "./styles.css";

// 画面は3つだけなのでルーターは使わない
function App() {
	const [, page, room] = location.pathname.split("/");
	if (page === "screen" && room) return <Screen room={room} />;
	if (page === "director" && room) return <Director room={room} />;
	return <Home />;
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
