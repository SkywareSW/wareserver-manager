const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

let win;
let serverProcess = null;
let serverRunning = false;
let playitProcess = null;
let playitRunning = false;

// playit binary stored in app userData
const playitDir = () => path.join(app.getPath('userData'), 'playit');
const playitBin = () => path.join(playitDir(), process.platform === 'win32' ? 'playit.exe' : 'playit');

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const tryGet = (u, redirects = 0) => {
      if (redirects > 10) return reject(new Error('Too many redirects'));
      const mod = u.startsWith('https') ? https : require('http');
      mod.get(u, { headers: { 'User-Agent': 'WareServer-Manager' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return tryGet(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('HTTP ' + res.statusCode));
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      }).on('error', reject);
    };
    tryGet(url);
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    frame: false,
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#0a0a0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 12 }
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (playitProcess) playitProcess.kill();
  app.quit();
});

// ─── Window Controls ──────────────────────────────────────────
ipcMain.on('window-minimize', () => win.minimize());
ipcMain.on('window-maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('window-close', () => {
  if (serverProcess) serverProcess.stdin.write('stop\n');
  setTimeout(() => win.close(), 1500);
});

// ─── File Dialog ──────────────────────────────────────────────
ipcMain.handle('pick-jar', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Select Server JAR',
    filters: [{ name: 'JAR Files', extensions: ['jar'] }],
    properties: ['openFile']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('pick-dir', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Select Server Folder',
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('pick-upload-files', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Select Files to Upload',
    properties: ['openFile', 'multiSelections']
  });
  return result.canceled ? [] : result.filePaths;
});

// ─── Server Control ───────────────────────────────────────────
ipcMain.handle('server-start', async (event, { jarPath, serverDir, ram, javaPath }) => {
  if (serverRunning) return { ok: false, error: 'Already running' };
  if (!fs.existsSync(jarPath)) return { ok: false, error: 'JAR not found: ' + jarPath };

  const args = [
    `-Xmx${ram}M`,
    `-Xms${Math.round(ram * 0.5)}M`,
    '-jar', jarPath,
    'nogui'
  ];

  try {
    serverProcess = spawn(javaPath || 'java', args, {
      cwd: serverDir,
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (e) {
    return { ok: false, error: 'Failed to spawn process: ' + e.message };
  }

  serverRunning = true;

  serverProcess.stdout.on('data', data => {
    data.toString().split('\n').filter(Boolean).forEach(line => {
      const type = line.includes('WARN') ? 'warn'
        : line.includes('ERROR') ? 'error'
        : line.includes('joined the game') || line.includes('left the game') ? 'join'
        : line.includes('Done') ? 'success'
        : 'info';
      win.webContents.send('server-log', { type, text: line.replace(/\[.*?\] \[.*?\]: ?/, '').trim() });
    });
  });

  serverProcess.stderr.on('data', data => {
    data.toString().split('\n').filter(Boolean).forEach(line => {
      win.webContents.send('server-log', { type: 'warn', text: line.trim() });
    });
  });

  serverProcess.on('close', code => {
    serverRunning = false;
    serverProcess = null;
    win.webContents.send('server-stopped', { code });
  });

  return { ok: true };
});

ipcMain.handle('server-stop', async () => {
  if (!serverProcess) return { ok: false, error: 'Not running' };
  serverProcess.stdin.write('stop\n');
  return { ok: true };
});

ipcMain.handle('server-kill', async () => {
  if (!serverProcess) return { ok: false, error: 'Not running' };
  serverProcess.kill('SIGKILL');
  serverRunning = false;
  serverProcess = null;
  return { ok: true };
});

ipcMain.handle('server-command', async (event, { command }) => {
  if (!serverProcess) return { ok: false, error: 'Not running' };
  serverProcess.stdin.write(command + '\n');
  return { ok: true };
});

ipcMain.handle('server-status', () => ({ running: serverRunning }));

// ─── File System ──────────────────────────────────────────────
ipcMain.handle('fs-list', (event, { dir }) => {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return {
      ok: true,
      files: entries.map(e => {
        const full = path.join(dir, e.name);
        let size = '—', date = '—';
        try {
          const stat = fs.statSync(full);
          date = stat.mtime.toISOString().slice(0, 10);
          if (e.isFile()) {
            const b = stat.size;
            size = b < 1024 ? b + ' B'
              : b < 1048576 ? (b / 1024).toFixed(1) + ' KB'
              : (b / 1048576).toFixed(1) + ' MB';
          }
        } catch {}
        return { name: e.name, type: e.isDirectory() ? 'folder' : 'file', size, date };
      })
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('fs-copy', async (event, { sources, destDir }) => {
  const results = [];
  for (const src of sources) {
    try {
      const dest = path.join(destDir, path.basename(src));
      fs.copyFileSync(src, dest);
      results.push({ name: path.basename(src), ok: true });
    } catch (e) {
      results.push({ name: path.basename(src), ok: false, error: e.message });
    }
  }
  return { ok: true, results };
});

ipcMain.handle('fs-delete', (event, { filePath }) => {
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) fs.rmSync(filePath, { recursive: true });
    else fs.unlinkSync(filePath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('fs-open', (event, { filePath }) => {
  shell.openPath(filePath);
  return { ok: true };
});

ipcMain.handle('fs-reveal', (event, { filePath }) => {
  shell.showItemInFolder(filePath);
  return { ok: true };
});

// ─── Settings persistence ─────────────────────────────────────
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

ipcMain.handle('settings-load', () => {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    return null;
  }
});

ipcMain.handle('settings-save', (event, data) => {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ─── Playit.gg ────────────────────────────────────────────────
ipcMain.handle('playit-status', () => ({
  running: playitRunning,
  installed: fs.existsSync(playitBin())
}));

ipcMain.handle('playit-install', async () => {
  try {
    fs.mkdirSync(playitDir(), { recursive: true });
    const bin = playitBin();
    const platform = process.platform;
    const arch = process.arch === 'arm64' ? 'aarch64' : 'amd64';
    const VERSION = '0.17.1';
    const BASE = `https://github.com/playit-cloud/playit-agent/releases/download/v${VERSION}`;
    let url;
    if (platform === 'win32') {
      url = `${BASE}/playit-windows-x86_64-signed.exe`;
    } else if (platform === 'darwin') {
      url = `${BASE}/playit-darwin-${arch}`;
    } else {
      url = `${BASE}/playit-linux-${arch}`;
    }

    win.webContents.send('playit-log', { type: 'info', text: 'Downloading playit agent...' });
    await downloadFile(url, bin);

    if (platform !== 'win32') {
      fs.chmodSync(bin, '755');
    }

    win.webContents.send('playit-log', { type: 'success', text: 'playit installed successfully.' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('playit-start', async () => {
  if (playitRunning) return { ok: false, error: 'Already running' };
  const bin = playitBin();
  if (!fs.existsSync(bin)) return { ok: false, error: 'playit not installed' };

  try {
    playitProcess = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    playitRunning = true;

    const stripAnsi = s => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b\[\d+;\d+H/g, ' ').trim();

    playitProcess.stdout.on('data', data => {
      data.toString().split('\n').filter(Boolean).forEach(line => {
        const text = stripAnsi(line);
        if (!text) return;
        const type = text.toLowerCase().includes('error') ? 'error'
          : text.includes('playit.gg') || text.includes('tunnel') || text.includes('address') ? 'success'
          : 'info';
        win.webContents.send('playit-log', { type, text });
      });
    });

    playitProcess.stderr.on('data', data => {
      data.toString().split('\n').filter(Boolean).forEach(line => {
        const text = stripAnsi(line);
        if (!text) return;
        const type = text.includes('error') ? 'error'
          : text.includes('tcp') || text.includes('udp') || text.includes('addr') || text.includes('claim') ? 'success'
          : 'info';
        win.webContents.send('playit-log', { type, text });
      });
    });

    playitProcess.on('close', code => {
      playitRunning = false;
      playitProcess = null;
      win.webContents.send('playit-stopped', { code });
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('playit-stop', async () => {
  if (!playitProcess) return { ok: false, error: 'Not running' };
  playitProcess.kill();
  playitRunning = false;
  playitProcess = null;
  return { ok: true };
});

ipcMain.handle('playit-open-browser', () => {
  shell.openExternal('https://playit.gg/login');
  return { ok: true };
});