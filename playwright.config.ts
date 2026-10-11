import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ui",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: "msedge",
    headless: true,
    viewport: { width: 1200, height: 800 },
  },
  webServer: {
    command: "npm run preview",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
  reporter: "list",
});
