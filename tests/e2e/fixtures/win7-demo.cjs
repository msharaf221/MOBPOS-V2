const {app, BrowserWindow} = require('electron');
app.disableHardwareAcceleration();
app.whenReady().then(() => {
  const win = new BrowserWindow({width: 1366, height: 900, webPreferences: {sandbox: true, contextIsolation: true, nodeIntegration: false}});
  win.loadURL(process.env.WIN7_DEMO_URL);
});
