const path = require('path');
const http = require('http');
const electron = require('electron');
const {app, ipcMain, BrowserWindow} = electron;

const url = process.argv[2];

if (url) {
  app.commandLine.appendSwitch('high-dpi-support', 'true');
  app.commandLine.appendSwitch('force-device-scale-factor', '1');

  const _requestAppReady = () => new Promise((accept, reject) => {
    app.on('ready', () => {
      accept();
    });
    app.on('error', err => {
      reject(err);
    });
  });

  _requestAppReady()
    .then(() => {
      let oldX = 0;
      let oldY = 0;
      ipcMain.on('ipc', (event, e) => {
        const {method} = e;
        switch (method) {
          case 'startMove': {
            const position = win.getPosition();
            oldX = position[0];
            oldY = position[1];
            break;
          }
          case 'move': {
            const {args: [dx, dy]} = e;
            win.setPosition(oldX + dx, oldY + dy);
            break;
          }
          case 'minimize': {
            win.minimize();
            break;
          }
          case 'maximize': {
            win.maximize();
            break;
          }
          case 'unmaximize': {
            win.unmaximize();
            break;
          }
          case 'restore': {
            win.restore();
            break;
          }
          case 'close': {
            win.close();
            break;
          }
          case 'show': {
            win.show();
            break;
          }
          case 'hide': {
            win.hide();
            break;
          }
          case 'quit': {
            process.exit(0);
            break;
          }
        }
      });

      const zoomFactor = 1.5;
      const win = new BrowserWindow({
        width: 1280 * zoomFactor,
        height: 1024 * zoomFactor,
        // show: false,
        icon: path.join(__dirname, 'icon.png'),
        frame: false,
        titleBarStyle: 'hidden',
        autoHideMenuBar: true,
        // thickFrame: false,
        backgroundThrottling: false,
        // darkTheme: true,
        webPreferences: {
          preload: path.join(__dirname, 'api.js'),
          zoomFactor,
          // webSecurity: false,
        },
      });
      win.loadURL(url);
      win.on('maximize', () => {
        win.webContents.send('ipc', {
          method: 'maximize',
        });
      });
      win.on('unmaximize', () => {
        win.webContents.send('ipc', {
          method: 'unmaximize',
        });
      });
      win.webContents.openDevTools({
        mode: 'bottom',
        // mode: 'detach',
      });
      win.webContents.on('did-fail-load', () => {
        process.exit(1);
      });
      win.webContents.on('crashed', () => {
        process.exit(0);
      });
      win.webContents.on('devtools-closed', () => {
        process.exit(0);
      });
    })
    .catch(err => {
      console.warn(err.stack);
      process.exit(1);
    });
} else {
  console.warn('usage: run.cmd [URL]');
  process.exit(1);
}
