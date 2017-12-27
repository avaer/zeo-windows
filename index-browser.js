const path = require('path');
const http = require('http');
const {app, ipcMain, BrowserWindow} = require('electron');

const url = process.argv[2];

if (url) {
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
      ipcMain.on('ipc', (event, e) => {
        const {method} = e;
        switch (method) {
          case 'move': {
            const {args: [dx, dy]} = e;
            const [oldX, oldY] = win.getPosition();
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
      
      const win = new BrowserWindow({
        width: 1280,
        height: 1024,
        // show: false,
        icon: path.join(__dirname, 'icon.png'),
        frame: false,
        backgroundThrottling: false,
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, 'api.js'),
          // webSecurity: false,
        },
      });
      win.loadURL(url);
      win.webContents.openDevTools({
        mode: 'detach',
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
