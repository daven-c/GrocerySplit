/** Splitpot design tokens (see design handoff). Person colors are computed per member (src/lib/people.ts). */
module.exports = {
	content: ["./index.html", "./src/**/*.{ts,tsx}"],
	theme: {
		extend: {
			colors: {
				ink: { DEFAULT: "#1B1A17", hover: "#33312C" },
				body: "#4A4741",
				muted: "#6E6A63",
				faint: "#8A867E",
				ghost: "#B3AFA6",
				dash: "#CFCBC2",
				line: "#DAD6CD",
				edge: "#E7E4DD",
				rule: "#EFEDE7",
				track: "#ECE9E2",
				surface: "#F6F6F4",
				wash: "#F8F8F6",
				chev: "#A8A49C",
				green: {
					DEFAULT: "oklch(0.56 0.17 155)",
					brand: "oklch(0.7 0.19 155)",
					tint: "oklch(0.95 0.06 155)",
					on: "oklch(0.42 0.15 155)",
					icon: "oklch(0.48 0.16 155)",
					mint: "oklch(0.8 0.18 155)",
					band: "oklch(0.92 0.09 155)",
					deep: "oklch(0.32 0.11 155)",
				},
				coral: {
					DEFAULT: "oklch(0.58 0.2 30)",
					strong: "oklch(0.56 0.2 30)",
					tint: "oklch(0.95 0.06 30)",
					on: "oklch(0.45 0.16 30)",
				},
			},
			fontFamily: {
				sans: ['"Schibsted Grotesk"', "system-ui", "sans-serif"],
				mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
			},
			boxShadow: {
				popover: "0 12px 32px rgba(27,26,23,0.12)",
				landing: "0 24px 60px rgba(27,26,23,0.08)",
				seg: "0 1px 2px rgba(0,0,0,0.08)",
			},
			letterSpacing: {
				tightest: "-0.04em",
				title: "-0.025em",
			},
		},
	},
	plugins: [],
};
