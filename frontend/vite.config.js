import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Only VITE_-prefixed variables reach the browser bundle. That boundary is what keeps
// AWS credentials out of the frontend: they are never named here and never read here.
export default defineConfig({
  plugins: [react()],
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
});
