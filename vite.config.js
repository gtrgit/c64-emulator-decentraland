import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3001,
    https: {
      key: './key.pem',
      cert: './cert.pem'
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html'
      }
    }
  }
})
