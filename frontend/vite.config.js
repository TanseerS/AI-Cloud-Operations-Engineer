import process from 'node:process';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { APP_VERSION } from '../version.js';

// Only VITE_-prefixed variables reach the browser bundle. That boundary is what keeps
// AWS credentials out of the frontend: they are never named here and never read here.
export default defineConfig(({ command, mode }) => {
  // A production bundle pointing at localhost is not a broken configuration, it is a
  // broken release - and it fails silently, in the browser, after deployment. So the
  // build refuses rather than producing one.
  const apiBaseUrl = process.env.VITE_API_BASE_URL ?? '';
  if (command === 'build' && mode === 'production' && !/^https:\/\//.test(apiBaseUrl)) {
    throw new Error(
      'VITE_API_BASE_URL must be set to the deployed https API endpoint for a production build. ' +
        `Received: "${apiBaseUrl || '(unset)'}".`,
    );
  }

  return {
    plugins: [react()],
    // The version is defined once at the repository root and injected here, so the
    // browser and the API can never disagree about which release is running.
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
    },
    server: {
      // 5173 is the Vite default and collides with other local projects, so this
      // app claims its own port. strictPort makes a collision fail loudly.
      port: 5180,
      strictPort: true,
    },
    preview: {
      port: 4180,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
