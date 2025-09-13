const { app, BrowserWindow } = require('electron');
const path = require('path');


function createWindow() {
  // Use app.isPackaged to reliably detect production build
  const isDev = !app.isPackaged && (process.env.NODE_ENV !== 'production');

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    // use a relative icon path bundled with the app (falls back gracefully if missing)
    icon: path.join(__dirname, '..', 'assets', 'icon_chatgpt.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: isDev
    }
  });

  // Masquer la barre de menu
  win.setMenuBarVisibility(false);

  if (isDev) {
    win.loadURL('http://localhost:5173');
    // ouvrir DevTools automatiquement en dev pour faciliter le debug
    win.webContents.openDevTools();
  } else {
    // En production, charger le fichier build avec loadFile (résout mieux les chemins asar)
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    win.loadFile(indexPath).catch(err => {
      console.error('Erreur lors du chargement du fichier index:', err);
      // fall back: show an error page from dist if possible
      try {
        const fallback = path.join(__dirname, '..', 'dist', 'index.html');
        win.loadFile(fallback);
      } catch (e) {
        console.error('Fallback load failed:', e);
      }
    });
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
