import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // aws-amplify (auth) aporta ~400 kB al bundle: se eleva el umbral del aviso de tamaño.
  build: { sourcemap: false, chunkSizeWarningLimit: 700 },
});
