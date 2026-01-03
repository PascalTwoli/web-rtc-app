import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    port: 5173,
    host: true, // Expose to network
    https: true, // Enable HTTPS for camera/mic access on network
    proxy: {
      '/api': {
        target: 'http://localhost:4430',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
