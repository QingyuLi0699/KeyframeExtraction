import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', timeout: 120000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5187', viewport: { width: 1366, height: 768 }, launchOptions: { executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--autoplay-policy=no-user-gesture-required'] } },
  globalSetup: './tests/setup.ts',
});
