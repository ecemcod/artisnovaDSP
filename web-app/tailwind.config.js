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
                // Enhanced color palette for Roon-style design
                "text-primary": "var(--text-primary)",
                "text-secondary": "var(--text-secondary)",
                "text-muted": "var(--text-muted)",
                "bg-deep": "var(--bg-deep)",
                "bg-panel": "var(--bg-panel)",
                "bg-card": "var(--bg-card)",
                "border-subtle": "var(--border-subtle)",
                "border-medium": "var(--border-medium)",
            },
            fontFamily: {
                'sans': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'sans-serif'],
                'serif': ['Crimson Text', 'Georgia', 'Times New Roman', 'serif'],
                'mono': ['JetBrains Mono', 'Monaco', 'Cascadia Code', 'Segoe UI Mono', 'Roboto Mono', 'monospace'],
                'display': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
                'body': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
            },
            fontSize: {
                'display-large': ['1.35rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '800' }],
                'display': ['1.125rem', { lineHeight: '1.2', letterSpacing: '-0.015em', fontWeight: '700' }],
                'headline-large': ['0.9rem', { lineHeight: '1.25', letterSpacing: '-0.01em', fontWeight: '600' }],
                'headline': ['0.75rem', { lineHeight: '1.3', letterSpacing: '-0.005em', fontWeight: '600' }],
                'title-large': ['0.675rem', { lineHeight: '1.4', letterSpacing: '0', fontWeight: '500' }],
                'title': ['0.6rem', { lineHeight: '1.4', letterSpacing: '0', fontWeight: '500' }],
                'body-large': ['0.5625rem', { lineHeight: '1.6', letterSpacing: '0', fontWeight: '400' }],
                'body': ['0.4875rem', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '400' }],
                'caption-large': ['0.4125rem', { lineHeight: '1.4', letterSpacing: '0.01em', fontWeight: '500' }],
                'caption': ['0.375rem', { lineHeight: '1.3', letterSpacing: '0.015em', fontWeight: '500' }],
                'artist-name': ['0.9rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '700' }],
                'album-title': ['0.75rem', { lineHeight: '1.3', letterSpacing: '-0.005em', fontWeight: '600' }],
                'track-title': ['0.5625rem', { lineHeight: '1.4', fontWeight: '500' }],
                'metadata': ['0.4875rem', { lineHeight: '1.4', fontWeight: '400' }],
                'biography': ['0.525rem', { lineHeight: '1.7', letterSpacing: '0.002em', fontWeight: '400' }],
            },
            spacing: {
                '18': '4.5rem',
                '88': '22rem',
                '128': '32rem',
            },
            borderRadius: {
                'xl': '1rem',
                '2xl': '1.5rem',
                '3xl': '2rem',
            },
            boxShadow: {
                'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
                'medium': '0 4px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                'strong': '0 10px 40px -10px rgba(0, 0, 0, 0.15), 0 2px 10px -2px rgba(0, 0, 0, 0.05)',
            },
        },
    },
    plugins: [],
}
