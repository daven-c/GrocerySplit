import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import config from "../config.json";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react()],
	server: {
		port: config.ports.frontend,
		proxy: {
			"/api": {
				target: `${config.api.baseUrl}:${config.ports.backend}`,
				changeOrigin: true,
				secure: false,
			},
		},
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "src"),
		},
	},
	build: {
		outDir: "build",
	},
});
