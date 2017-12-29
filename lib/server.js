const path = require('path');
const fs = require('fs');
const {http, https} = require('follow-redirects');
const childProcess = require('child_process');

const mkdirp = require('mkdirp');
const touch = require('touch');
const tar = require('tar');
const getport = require('getport');
const pidify = require('pidify');

const requestLocalServers = new Promise((accept, reject) => {
  const serversPath = path.join(__dirname, '..', 'servers');

  fs.readdir(serversPath, (err, files) => {
    if (!err) {
      Promise.all(files.map(server => new Process((accept, reject) => {
        const _requestInstallPidfile = () => new Promise((accept, reject) => {
          const installPidfilePath = path.join(serversPath, server, 'install.pid');

          fs.readFile(installPidfilePath, (err, s) => {
            if (!err) {
              const j = _jsonParse(s);

              if (j !== null) {
                accept(j);
              } else {
                const err = new Error('failed to parse install pidfile: ' + installPidfilePath);
                err.code = 'EPARSE';
                reject(err);
              }
            } else {
              reject(err);
            }
          });
        });

        fs.lstat(path.join(serversPath, server, 'data', 'installed.txt'), err => {
          if (!err) {
            _requestInstallPidfile
              .then(installPidfile => {
                const port = (() => {
                  const {args} = installPidfile;
                  for (let i = 0; i < args.length; i++) {
                    const match = args[i].match(/^port=(.+)$/);
                    if (match) {
                      const port = parseInt(match[1], 10);
                      if (!isNaN(port)) {
                        return port;
                      }
                    }
                  }
                  return null;
                })();

                return pidify(path.join(serversPath, server, 'server.pid')).isRunning()
                  .then(running => {
                    return {
                      address: '127.0.0.1',
                      port,
                      mods: [],
                      players: [],
                      state: {
                        installing: false,
                        installed: true,
                        running,
                      },
                    };
                  });
              })
              .catch(err => {
                console.warn(err);
                return Promise.resolve(null);
              })
              .then(accept, reject);
          } else if (err.code === 'ENOENT') {
            _requestInstallPidfile
              .then(installPidfile => {
                const port = (() => {
                  const {args} = installPidfile;
                  for (let i = 0; i < args.length; i++) {
                    const match = args[i].match(/^port=(.+)$/);
                    if (match) {
                      const port = parseInt(match[1], 10);
                      if (!isNaN(port)) {
                        return port;
                      }
                    }
                  }
                  return null;
                })();

                return {
                  address: '127.0.0.1',
                  port,
                  mods: [],
                  players: [],
                  state: {
                    installing: true,
                    installed: false,
                    running: false,
                  },
                };
              })
              .catch(err => {
                console.warn(err);
                return Promise.resolve(null);
              })
              .then(accept, reject);
          } else {
            reject(err);
          }
        });
      })))
        .then(serverSpecs => serverSpecs.filter(serverSpec => serverSpec !== null))
        .catch(reject);
    } else if (err.code === 'ENOENT') {
      accept([]);
    } else {
      reject(err);
    }
  });
});
const spawnCreateLocalServer = ({name}) => _getport()
  .then(port => pidify(path.join(__dirname, '..', 'servers', name, 'install.pid')).spawn(
    process.argv[0],
    [process.argv[1], 'install', 'name=' + name, 'port=' + port],
    {
      cwd: process.cwd(),
    }
  ))
  .then(cp => new Promise((accept, reject) => {
    cp.stdin.end();

    const bs = [];
    cp.stdout.on('data', d => {
      bs.push(d);
    });
    // cp.stderr.pipe(process.stderr);
    cp.on('error', reject);
    cp.on('exit', code => {
      if (code === 0) {
        const b = Buffer.concat(bs);
        const s = b.toString('utf8');
        const j = _jsonParse(s);
        if (j !== null) {
          if (!j.error) {
            accept(j);
          } else {
            reject(new Error(j.error));
          }
        } else {
          reject(new Error('error parsing install process output: ' + JSON.stringify(s)));
        }
      } else {
        reject(new Error('install process closed with code: ' + code));
      }
    });
  }));
const createLocalServer = ({name, port}) => {
  const dirname = path.join(__dirname, '..', 'servers', name);

  const _downloadRelease = () => new Promise((accept, reject) => {
    mkdirp(dirname, err => {
      if (!err) {
        const proxyReq = https.get({
          host: 'render.zeovr.io',
          path: '/release.tar.gz',
        }, proxyRes => {
          if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
            // const contentLength = parseInt(proxyRes.headers['content-length'], 10);

            const ws = tar.x({
              strip: 1,
              C: dirname,
            });
            proxyRes.on('error', reject);
            ws.on('error', reject);
            proxyRes.pipe(ws);

            /* let bytesRead = 0;
            proxyRes.on('data', d => {
              bytesRead += d.length;

              win.webContents.send('ipc', {
                method: 'progress',
                args: [id, bytesRead/contentLength],
              });
            }); */
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
              touch(path.join(dirname, 'data', 'installed.txt'), err => {
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
        } else {
          reject(err);
        }
      });
    }));

  return new Promise((accept, reject) => {
    fs.lstat(path.join(dirname, 'data', 'installed.txt'), err => {
      if (err && err.code === 'ENOENT') {
        accept();
      } else if (!err) {
        const err = new Error('server name already exists:' + name);
        err.code = 'EEXIST';
        reject(err);
      } else {
        reject(err);
      }
    });
  })
    .then(() => {
      _downloadRelease()
        .then((() => startServer({name, port}))
        .catch(err => {
          throw err;
        });

      return {
        address: '127.0.0.1',
        port,
        mods: [],
        players: [],
        state: {
          installing: true,
          installed: false,
          running: false,
        },
      };
    });
};
const startServer = ({name, port}) => {
  const dirname = path.join(__dirname, '..', 'servers', name);

  return pidify(path.join(dirname, 'server.pid')).spawn(
    path.join(dirname, 'windows', 'node', 'node.exe'),
    [
      require.resolve('spog'),
      'log.txt',
      path.join(dirname, 'windows', 'node', 'node.exe'), 'index.js', 'port=' + port, 'noTty',
    ],
    {
      cwd: dirname,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }
  )
    .then(cp => new Promise((accept, reject) => {
      // cp.stdin.end();
      cp.unref();

      accept();
    }));
};
const _gettport = () => new Promise((accept, reject) => {
  getport(8000, (err, port) => {
    if (!err) {
      accept(port);
    } else {
      reject(err);
    }
  });
});
const _jsonParse = s => {
  try {
    return JSON.parse(s);
  } catch(err) {
    return null;
  }
};

module.exports = {
  requestLocalServers,
  spawnCreateLocalServer,
  createLocalServer,
  startServer,
};
