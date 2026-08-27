import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');

    // Expose selected env vars to the client as process.env.* so the Deriv auth
    // code (which reads process.env.CLIENT_ID etc.) works unchanged.
    const define: Record<string, string> = {};
    ['CLIENT_ID', 'APP_ID', 'REDIRECT_URL', 'API_URL', 'SITE_URL'].forEach(key => {
        define[`process.env.${key}`] = JSON.stringify(env[key] ?? '');
    });

    // When serving through an https tunnel (ngrok/cloudflare) the page loads on
    // port 443, so Vite's HMR websocket must connect on 443 too. Enable with
    // TUNNEL=1 in .env.
    const tunnel = env.TUNNEL === '1' || env.TUNNEL === 'true';

    return {
        plugins: [react()],
        define,
        resolve: {
            alias: { '@': path.resolve(__dirname, './src') },
        },
        server: {
            port: 5173,
            host: true,
            allowedHosts: true,
            hmr: tunnel ? { clientPort: 443 } : undefined,
            // Proxy the API through the dev server so the browser only ever
            // talks to this (same) origin — required when serving over a tunnel.
            proxy: {
                '/api': { target: 'http://localhost:4100', changeOrigin: true },
            },
        },
        preview: {
            port: 4173,
            host: true,
            allowedHosts: true,
            proxy: {
                '/api': { target: 'http://localhost:4100', changeOrigin: true },
            },
        },
    };
});
