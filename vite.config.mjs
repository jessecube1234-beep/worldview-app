import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendPort = env.PORT || '4000';
  const proxyTarget = env.VITE_API_PROXY_TARGET || `http://localhost:${backendPort}`;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': proxyTarget,
        '/config.js': proxyTarget,
        '/health': proxyTarget,
      },
    },
  };
});
