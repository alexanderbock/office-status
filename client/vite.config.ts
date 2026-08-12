import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function serverPort(): number {
  try {
    const config = JSON.parse(
      readFileSync(new URL("../config.json", import.meta.url), "utf8")
    ) as { hostingPort: number };
    return config.hostingPort;
  }
  catch {
    return 8000;
  }
}

const target = `http://localhost:${serverPort()}`;

export default defineConfig({
  plugins: [ react() ],
  server: {
    proxy: {
      "/api": target,
      "/xkcd": target
    }
  }
});
