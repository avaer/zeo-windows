const path = require('path');
const fs = require('fs');
const {http, https} = require('follow-redirects');
const childProcess = require('child_process');

const mkdirp = require('mkdirp');
const touch = require('touch');
const tar = require('tar');
const pidify = require('pidify');

const createLocalServer = ({name}) => {
  const dirname = path.join(__dirname, 'servers', name);

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
  const _startServer = () => pidify(path.join(dirname, 'server.pid')).spawn(
    'powershell.exe',
    [
      '-NonInteractive',
      '-Command',
      `Start-Process -FilePath ./windows/node/node.exe -ArgumentList "index.js","noTty" -NoNewWindow -RedirectStandardOutput out-log.txt -RedirectStandardError err-log.txt`
    ], {
    cwd: dirname,
    // detached: true,
    // stdio: 'ignore'
  })
    .then(cp => {
      cp.on('error', err => {
        console.warn(err);
      });
      cp.stdout.pipe(process.stdout);
      cp.stderr.pipe(process.stderr);
      // cp.unref();
    });

  return new Promise((accept, reject) => {
    fs.lstat(dirname, err => {
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
    .then(() => _downloadRelease())
    .then(() => _startServer())
    .then(() => {
      return {
        address: '127.0.0.1',
        port: 8000,
        mods: [],
        players: [],
        state: {
          installing: false,
          installed: true,
          running: true,
        }
      };
    });
};
