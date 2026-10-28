import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), cloudflare()],
	// 同じLANのスマホから開発サーバーに入れるようにする
	server: { host: true },
});
