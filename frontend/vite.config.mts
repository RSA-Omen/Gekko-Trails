import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: false,
    // Allow all hosts (for development on network hostname)
    // In Vite, we can use an array or disable the check entirely
    // Using a wildcard pattern to allow the domain
    allowedHosts: [
      "gvdi-30.netbird.selfhosted",
      "localhost",
      "127.0.0.1"
    ],
    proxy: {
      "/api": {
        target: "http://localhost:8001",
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on("error", (err, _req, _res) => {
            console.log("Proxy error:", err);
          });
          proxy.on("proxyReq", (proxyReq, req, _res) => {
            console.log("Proxying request:", req.method, req.url);
          });
        },
      }
    }
  }
});
