const path = require('path');
const fs = require('fs');
const {http, https} = require('follow-redirects');
const childProcess = require('child_process');

const mkdirp = require('mkdirp');
const touch = require('touch');
const tar = require('tar');
const getport = require('getport');
const rimraf = require('rimraf');
const tailStream = require('tail-stream');
const pidify = require('pidify');

module.exports = ({console}) => {

const requestLocalServers = () => new Promise((accept, reject) => {
  const serversPath = path.join(__dirname, '..', 'servers');

  fs.readdir(serversPath, (err, files) => {
    if (!err) {
      Promise.all(files.map(server => new Promise((accept, reject) => {
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
            _requestInstallPidfile()
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
                      subscription: 'local:' + server,
                      uid: 'local',
                      name: server,
                      address: '127.0.0.1',
                      port,
                      mods: [],
                      items: [],
                      players: [],
                      local: true,
                      state: {
                        installing: false,
                        installed: true,
                        running,
                      },
                    };
                  });
              })
              .catch(err => {
                // console.warn(err);
                return Promise.resolve(null);
              })
              .then(accept, reject);
          } else if (err.code === 'ENOENT') {
            _requestInstallPidfile()
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
                  subscription: 'local:' + server,
                  uid: 'local',
                  name: server,
                  address: '127.0.0.1',
                  port,
                  mods: [],
                  items: [],
                  players: [],
                  local: true,
                  state: {
                    installing: true,
                    installed: false,
                    running: false,
                  },
                };
              })
              .catch(err => {
                // console.warn(err);
                return Promise.resolve(null);
              })
              .then(accept, reject);
          } else {
            reject(err);
          }
        });
      })))
        .then(serverSpecs => serverSpecs.filter(serverSpec => serverSpec !== null))
        .then(accept, reject);
    } else if (err.code === 'ENOENT') {
      accept([]);
    } else {
      reject(err);
    }
  });
});
const spawnCreateLocalServer = ({name, port = null}) => {
  const dirname = path.join(__dirname, '..', 'servers', name);

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
      if (port) {
        return Promise.resolve(port);
      } else {
        return _getport();
      }
    })
    .then(port => {
      return pidify(path.join(dirname, 'install.pid')).spawn(
        process.argv[0],
        [process.argv[1], 'install', 'name=' + name, 'port=' + port, 'log=' + path.join(dirname, 'log.txt')],
        {
          cwd: process.cwd(),
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        }
      )
        .then(cp => {
          cp.unref();
          // cp.stdout.pipe(process.stdout);
          // cp.stderr.pipe(process.stderr);

          return {
            subscription: 'local:' + name,
            uid: 'local',
            name,
            address: '127.0.0.1',
            port,
            mods: [],
            items: [],
            players: [],
            local: true,
            state: {
              installing: true,
              installed: false,
              running: false,
            },
          };
        });
    });
};
const createLocalServer = ({name, port}) => {
  return _downloadRelease({name})
    .then((() => startServer({name, port})));
};
const removeLocalServer = ({name, port}) => {
  const dirname = path.join(__dirname, '..', 'servers', name);

  return stopServer({name})
    .then(() => cancelLocalServerInstall({name}))
    .then(() => _rimraf(dirname));
};
const spawnReinstallLocalServer = ({name}) => {
  return stopServer({name})
    .then(() => cancelLocalServerInstall({name}))
    .then(() => getLocalServerPort({name}))
    .then(port => spawnCreateLocalServer({name, port}));
};
const cancelLocalServerInstall = ({name}) => {
  const dirname = path.join(__dirname, '..', 'servers', name);
  const pidfilePath = path.join(dirname, 'install.pid');

  console.log('cancelling server install', {name, pidfilePath});

  return pidify(pidfilePath).getProcess()
    .then(processSpec => {
      if (processSpec) {
        console.log('killing server install process', {name, pidfilePath, pid: processSpec.pid});

        process.kill(processSpec.pid);
      } else {
        console.log('no server install process to kill', {name, pidfilePath});
      }
    });
};
const startServer = ({name, port}) => {
  const dirname = path.join(__dirname, '..', 'servers', name);
  const pidfilePath = path.join(dirname, 'server.pid');

  console.log('starting server', {name, port, pidfilePath});

  return pidify(pidfilePath).spawn(
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
      console.log('started server', {name, port, pid: cp.pid});

      // cp.stdin.end();
      cp.unref();

      accept();
    }));
};
const stopServer = ({name}) => {
  const dirname = path.join(__dirname, '..', 'servers', name);
  const pidfilePath = path.join(dirname, 'server.pid');

  console.log('stopping server', {name, pidfilePath});

  return pidify(pidfilePath).getProcess()
    .then(processSpec => {
      if (processSpec) {
        console.log('killing server process', {name, pidfilePath, pid: processSpec.pid});

        process.kill(processSpec.pid);
      } else {
        console.log('no server process to kill', {name, pidfilePath});
      }
    });
};
const getLocalServerPort = ({name}) => {
  return new Promise((accept, reject) => {
    const dirname = path.join(__dirname, '..', 'servers', name);
    const installPidfilePath = path.join(dirname, 'install.pid');

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
};
const createLogStream = ({name}) => {
  const dirname = path.join(__dirname, '..', 'servers', name);
  const logPath = path.join(dirname, 'log.txt');

  const s = tailStream.createReadStream(logPath);
  s.destroy = () => {
    s.end();
  };
  return s;
};

const _jsonParse = s => {
  try {
    return JSON.parse(s);
  } catch(err) {
    return null;
  }
};
const _getport = () => new Promise((accept, reject) => {
  getport(8000, (err, port) => {
    if (!err) {
      accept(port);
    } else {
      reject(err);
    }
  });
});
const _downloadRelease = ({name}) => {
  const dirname = path.join(__dirname, '..', 'servers', name);

  console.log('removing old data', {name, dirname});

  return _rimraf(path.join(dirname, 'data'))
    .then(() => new Promise((accept, reject) => {
      mkdirp(dirname, err => {
        if (!err) {
          console.log('downloading release', {name, dirname, url: `https://render.zeovr.io/release.tar.gz`});

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
    }))
    .then(() => new Promise((accept, reject) => {
      console.log('configuring', {name, dirname});

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
    }))
    .then(() => {
      console.log('done downloading release', {name, dirname});
    });
};
const _rimraf = p => new Promise((accept, reject) => {
  rimraf(p, err => {
    if (!err || err.code === 'EPERM') { // EPERM is a windows problem
      accept();
    } else {
      reject(err);
    }
  });
});

return {
  requestLocalServers,
  spawnCreateLocalServer,
  createLocalServer,
  removeLocalServer,
  spawnReinstallLocalServer,
  cancelLocalServerInstall,
  startServer,
  stopServer,
  getLocalServerPort,
  createLogStream,
};

};
