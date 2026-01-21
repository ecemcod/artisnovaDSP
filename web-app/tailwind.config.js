/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                accent: "#22c55e",
                "accent-primary": "#00d4ff",
                "accent-secondary": "#00d4ff",
                "accent-red": "#ef4444",
                surface: "#121212",
                panel: "#1a1a1a",
                deep: "#0a0a0a",
            },
        },
    },
    plugins: [],
}
