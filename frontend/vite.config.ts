import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// `npm run dev:mock` swaps the backend for in-memory fixtures so the UI can be driven without credentials.
const mock = process.env.MOCK === "1";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react()],
	server: {
		port: 3000,
	},
	resolve: {
		alias: [
			{ find: "@", replacement: resolve(__dirname, "src") },
			...(mock
				? [
						{ find: /^(\.\.?\/)+lib\/api$/, replacement: resolve(__dirname, "src/mocks/api.ts") },
						{ find: /^(\.\.?\/)+lib\/supabase$/, replacement: resolve(__dirname, "src/mocks/supabase.ts") },
				  ]
				: []),
		],
	},
	build: {
		outDir: "build",
	},
});
