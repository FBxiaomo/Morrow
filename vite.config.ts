import { defineConfig } from 'vite';
import { execFile } from 'node:child_process';

export default defineConfig({
  base: './',
  plugins: [{
    name: 'local-windows-fonts',
    configureServer(server) {
      server.middlewares.use('/__local-fonts', (req, res) => {
        const remote = req.socket.remoteAddress || '';
        if (req.method !== 'GET' || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)
          || req.headers['sec-fetch-site'] === 'cross-site'
          || req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
          res.statusCode = 403; res.end(); return;
        }
        if (process.platform !== 'win32') { res.statusCode = 404; res.end(); return; }
        const script = "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Add-Type -AssemblyName System.Drawing; $fonts = New-Object System.Drawing.Text.InstalledFontCollection; @($fonts.Families | ForEach-Object { @{ family = $_.Name; fullName = $_.GetName(2052) } }) | ConvertTo-Json -Compress";
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {windowsHide:true, timeout:15000, maxBuffer:4*1024*1024, encoding:'utf8'}, (error, stdout) => {
          res.setHeader('Content-Type','application/json; charset=utf-8');
          res.setHeader('Cache-Control','no-store');
          if(error) { res.statusCode = 500; res.end('{"error":"font enumeration failed"}'); return; }
          res.end(stdout.trim().replace(/^\uFEFF/,''));
        });
      });
    },
  }],
  server: {
    host: '127.0.0.1',
    port: 5190,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4190,
    strictPort: true,
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});
