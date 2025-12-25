/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                accent: "#22c55e",         // Pro Green
                "accent-secondary": "#0ea5e9", // Cyan
                "accent-red": "#ef4444",   // Red for alerts/stop
                surface: "#121212",
                panel: "#1a1a1a",
                deep: "#0a0a0a",
            },
        },
    },
    plugins: [],
}
