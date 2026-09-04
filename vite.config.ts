import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // Non-app churn (skill clones, critique snapshots, atomic edit temp dirs)
    // races the chokidar watcher and crashes the dev server with EBUSY.
    watch: {
      ignored: ["**/.agents/**", "**/.impeccable/**", "**/*.tmpdir/**"],
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "supabase-vendor": ["@supabase/supabase-js"],
          "map-vendor": ["leaflet", "leaflet.heat"],
          "chart-vendor": ["recharts"],
        },
      },
    },
  },
});
