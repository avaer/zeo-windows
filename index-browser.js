const path = require('path');
const fs = require('fs');
const {http, https} = require('follow-redirects');
// const http = require('http');
// const https = require('https');
const childProcess = require('child_process');

const mkdirp = require('mkdirp');
const touch = require('touch');
const tar = require('tar');
const _7z = require('7zip')['7z'];
const electron = require('electron');
const {app, ipcMain, BrowserWindow} = electron;

const url = process.argv[2];
const nodeVersion = '8.9.3';

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
          case 'createLocalServer': {
            const {args: [id, name]} = e;
            const dirname = path.join(__dirname, 'servers', name);

            const _downloadRelease = () => new Promise((accept, reject) => {
              mkdirp(dirname, err => {
                if (!err) {
                  const proxyReq = https.get({
                    host: 'render.zeovr.io',
                    path: '/release.tar.gz',
                  }, proxyRes => {
                    if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
                      const contentLength = parseInt(proxyRes.headers['content-length'], 10);

                      const ws = tar.x({
                        strip: 1,
                        C: dirname,
                      });
                      proxyRes.on('error', reject);
                      ws.on('error', reject);
                      proxyRes.pipe(ws);

                      let bytesRead = 0;
                      proxyRes.on('data', d => {
                        bytesRead += d.length;

                        win.webContents.send('ipc', {
                          method: 'progress',
                          args: [id, bytesRead/2/contentLength],
                        });
                      });
                      ws.on('finish', () => {
                        accept();
                      });
                    } else {
                      reject(new Error('download release got invalid status code: ' + proxyRes.statusCode));
                    }
                  });
                  proxyReq.on('error', reject);
                } else {
                  reject(err);
                }
              });
            })
              .then(() => new Promise((accept, reject) => {
                mkdirp(path.join(dirname, 'data'), err => {
                  if (!err) {
                    touch(path.join(dirname, 'data', 'no-hotload.json'), err => {
                      if (!err) {
                        accept();
                      } else {
                        reject(err);
                      }
                    });
                  } else {
                    reject(err);
                  }
                });
              }));
            const _downloadNode = () => new Promise((accept, reject) => {
              const bs = [];
              const proxyReq = https.get({
                host: 'render.zeovr.io',
                path: `/node.json`,
              }, proxyRes => {
                if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
                  proxyRes.on('data', d => {
                    bs.push(d);
                  });
                  proxyRes.on('end', () => {
                    const b = Buffer.concat(bs);
                    const s = b.toString('utf8');
                    const j = JSON.parse(s);
                    const {version} = j;
                    accept(version);
                  });
                  proxyRes.on('error', reject);
                } else {
                  reject(new Error('download node got invalid status code: ' + proxyRes.statusCode));
                }
              });
              proxyReq.on('error', reject);
            })
              .then(nodeVersion => {
                return new Promise((accept, reject) => {
                  mkdirp(path.join(dirname, 'downloads'), err => {
                    if (!err) {
                      const proxyReq = https.get({
                        host: 'nodejs.org',
                        path: `/dist/v${nodeVersion}/node-v${nodeVersion}-win-x64.7z`,
                      }, proxyRes => {
                        if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
                          const contentLength = parseInt(proxyRes.headers['content-length'], 10);
                          const ws = fs.createWriteStream(path.join(dirname, 'downloads', 'node.7z'));
                          proxyRes.on('error', reject);
                          ws.on('error', reject);

                          proxyRes.pipe(ws);
                          let bytesRead = 0;
                          proxyRes.on('data', d => {
                            bytesRead += d.length;

                            win.webContents.send('ipc', {
                              method: 'progress',
                              args: [id, 0.5 + bytesRead/2/contentLength],
                            });
                          });
                          ws.on('finish', () => {
                            accept();
                          });
                        } else {
                          reject(new Error('download node got invalid status code: ' + proxyRes.statusCode));
                        }
                      });
                      proxyReq.on('error', reject);
                    } else {
                      reject(err);
                    }
                  });
                })
                .then(() => new Promise((accept, reject) => {
                  const cp = childProcess.spawn(_7z, ['x', path.join(dirname, 'downloads', 'node.7z')], {
                    cwd: path.join(dirname, 'downloads'),
                  });

                  cp.on('error', reject);
                  cp.on('close', code => {
                    if (code === 0) {
                      accept();
                    } else {
                      reject(new Error('7z returned nonzero exit code: ' + code));
                    }
                  });

                  // cp.stderr.pipe(process.stderr);
                }))
                .then(() => new Promise((accept, reject) => {
                  fs.rename(path.join(dirname, 'downloads', `node-v${nodeVersion}-win-x64`), path.join(dirname, 'node'), err => {
                    if (!err) {
                      accept();
                    } else {
                      reject(err);
                    }
                  });
                }));
              });
            const _startServer = () => {
              console.log('start server', ['powershell.exe', '-NonInteractive', '-Command', `Start-Process -NoNewWindow -RedirectStandardOutput out-log.txt -RedirectStandardError err-log.txt -FilePath ./node/node.exe -ArgumentList "index.js","noTty"`], dirname);

              const cp = childProcess.spawn('powershell.exe', ['-NonInteractive', '-Command', `Start-Process -NoNewWindow -RedirectStandardOutput out-log.txt -RedirectStandardError err-log.txt -FilePath ./node/node.exe -ArgumentList "index.js","noTty"`], {
                cwd: dirname,
                // detached: true,
                // stdio: 'ignore'
              });
              cp.on('error', err => {
                console.warn(err);
              });
              cp.stdout.pipe(process.stdout);
              cp.stderr.pipe(process.stderr);
              // cp.unref();
              return Promise.resolve();
            };

            fs.lstat(dirname, err => {
              if (err && err.code === 'ENOENT') {
                _downloadRelease()
                  .then(() => _downloadNode())
                  .then(() => _startServer())
                  .then(() => {
                    const serverSpec = {
                      address: '127.0.0.1',
                      port: 8000,
                      mods: [],
                      players: [],
                      state: {
                        installing: false,
                        installed: true,
                        running: true,
                      }
                    }
                    win.webContents.send('ipc', {
                      method: 'response',
                      args: [id, null, serverSpec],
                    });
                  })
                  .catch(err => {
                    win.webContents.send('ipc', {
                      method: 'response',
                      args: [id, err.stack, null],
                    });
                  });
              } else if (!err) {
                console.warn(new Error('server name already exists:' + name));
              } else {
                console.warn(err);
              }
            });
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
      /* const devtools = new BrowserWindow({
        webPreferences: {
          zoomFactor,
        },
      }); */
      win.loadURL(url);
      // win.webContents.setDevToolsWebContents(devtools.webContents);
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
      /*win.webContents.on('did-fail-load', () => {
        process.exit(1);
      });*/
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
