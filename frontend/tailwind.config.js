/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                // ── Monochrome system ────────────────────────────────────────
                // Every colour is a CSS variable (RGB triplet) defined in
                // index.css, so the whole palette inverts between the dark and
                // light themes without touching a single class name.
                //
                // `ink` = surfaces (page → raised), `line` = borders,
                // `mist` = the muted text ramp, `fg` = primary text.
                ink: {
                    DEFAULT: 'rgb(var(--ink-900) / <alpha-value>)',
                    900: 'rgb(var(--ink-900) / <alpha-value>)',
                    800: 'rgb(var(--ink-800) / <alpha-value>)',
                    700: 'rgb(var(--ink-700) / <alpha-value>)',
                    600: 'rgb(var(--ink-600) / <alpha-value>)',
                    500: 'rgb(var(--ink-500) / <alpha-value>)',
                },
                line: {
                    DEFAULT: 'rgb(var(--line) / <alpha-value>)',
                    strong: 'rgb(var(--line-strong) / <alpha-value>)',
                },
                mist: {
                    100: 'rgb(var(--mist-100) / <alpha-value>)',
                    200: 'rgb(var(--mist-200) / <alpha-value>)',
                    300: 'rgb(var(--mist-300) / <alpha-value>)',
                    400: 'rgb(var(--mist-400) / <alpha-value>)',
                    500: 'rgb(var(--mist-500) / <alpha-value>)',
                    600: 'rgb(var(--mist-600) / <alpha-value>)',
                },
                // Primary text / inverted text. `fg` flips with the theme;
                // `on-fg` is always readable ON a `fg`-coloured fill.
                fg: 'rgb(var(--fg) / <alpha-value>)',
                'on-fg': 'rgb(var(--on-fg) / <alpha-value>)',
                // Semantic pair for P&L. Monochrome by design: profit reads at
                // full contrast, loss reads dimmed — always paired with an icon
                // or sign so the meaning never rests on tone alone.
                gain: 'rgb(var(--gain) / <alpha-value>)',
                loss: 'rgb(var(--loss) / <alpha-value>)',
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
                display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
                mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
            },
            container: {
                center: true,
                padding: '1.25rem',
                screens: { '2xl': '1200px' },
            },
            keyframes: {
                'fade-up': {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                ticker: {
                    '0%': { transform: 'translateX(0)' },
                    '100%': { transform: 'translateX(-50%)' },
                },
                pulseRing: {
                    '0%': { opacity: '0.55', transform: 'scale(0.9)' },
                    '70%': { opacity: '0', transform: 'scale(1.6)' },
                    '100%': { opacity: '0', transform: 'scale(1.6)' },
                },
            },
            animation: {
                'fade-up': 'fade-up 0.5s ease-out both',
                ticker: 'ticker 40s linear infinite',
                'pulse-ring': 'pulseRing 1.8s ease-out infinite',
            },
        },
    },
    plugins: [],
};
