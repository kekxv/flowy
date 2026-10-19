import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    // The only chunk above Vite's 500 kB default is the lazily loaded chart
    // library (echarts core + line chart ≈ 530 kB, request only after the
    // dashboard shell paints). Everything else stays well below the limit.
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/bot-attachments": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
