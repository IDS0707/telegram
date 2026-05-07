const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const url = require('url');

const isDev = !app.isPackaged;

// Serve the web bundle from a local HTTP server inside the app so that
// absolute paths like /assets/... and /_expo/... resolve correctly.
const WEB_DIR = path.join(__dirname, 'web');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const reqUrl = url.parse(req.url);
        let pathname = decodeURIComponent(reqUrl.pathname || '/');
        if (pathname === '/') pathname = '/index.html';
        const filePath = path.join(WEB_DIR, pathname);
        // Block path traversal.
        if (!filePath.startsWith(WEB_DIR)) {
          res.statusCode = 403;
          return res.end('Forbidden');
        }
        fs.stat(filePath, (err, stat) => {
          if (err || !stat.isFile()) {
            // SPA fallback: serve index.html for client-side routes.
            const indexPath = path.join(WEB_DIR, 'index.html');
            return fs.createReadStream(indexPath)
              .on('error', () => { res.statusCode = 404; res.end('Not found'); })
              .pipe(res.writeHead(200, { 'Content-Type': MIME['.html'] }) ? res : res);
          }
          const ext = path.extname(filePath).toLowerCase();
          res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Content-Length': stat.size,
            'Cache-Control': 'no-store',
          });
          fs.createReadStream(filePath).pipe(res);
        });
      } catch (e) {
        res.statusCode = 500;
        res.end('Server error');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(`http://127.0.0.1:${addr.port}`);
    });
    server.on('error', reject);
  });
}

async function createWindow() {
  const baseUrl = await startStaticServer();

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    title: 'S Chat',
    backgroundColor: '#0E1621',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('http://') || target.startsWith('https://')) {
      shell.openExternal(target);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  win.loadURL(baseUrl);

  if (isDev) win.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
