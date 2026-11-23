import { defineConfig } from '@playwright/test';
export default defineConfig({
    testDir: './tests', fullyParallel: false, workers: 1, timeout: 30000,
    reporter: 'list',
    use: { baseURL: 'http://127.0.0.1:5192', channel: 'msedge', headless: true, viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Shanghai', trace: 'retain-on-failure' },
    webServer: { command: 'npm run dev -- --port 5192', url: 'http://127.0.0.1:5192', reuseExistingServer: false, timeout: 20000 },
});
