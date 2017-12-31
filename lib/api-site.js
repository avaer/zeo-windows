(() => {

const stream = require('stream');

const {ipcRenderer} = require('electron');

const _makeId = () => Math.random().toString(36).substring(7);
const _makePromise = () => {
  let _accept, _reject;
  const result = new Promise((accept, reject) => {
    _accept = accept;
    _reject = reject;
  });
  result.accept = d => {
    _accept(d);
  };
  result.reject = err => {
    _reject(err);
  };
  return result;
};
const responses = {};
window.native = {
  ipc: ipcRenderer,
  back() {
    ipcRenderer.send('ipc', {
      method: 'back',
    });
  },
  forward() {
    ipcRenderer.send('ipc', {
      method: 'forward',
    });
  },
  refresh() {
    ipcRenderer.send('ipc', {
      method: 'refresh',
    });
  },
  stop() {
    ipcRenderer.send('ipc', {
      method: 'stop',
    });
  },
  contextMenu() {
    ipcRenderer.send('ipc', {
      method: 'contextmenu',
    });
  },
  requestHistoryState() {
    const id = _makeId();

    ipcRenderer.send('ipc', {
      method: 'requestHistoryState',
      args: [id],
    });

    const result = _makePromise();
    responses[id] = result;
    return result;
  },
  requestLocalServers() {
    const id = _makeId();

    ipcRenderer.send('ipc', {
      method: 'requestLocalServers',
      args: [id],
    });

    const result = _makePromise();
    responses[id] = result;
    return result;
  },
  createLocalServer({name}) {
    const id = _makeId();

    ipcRenderer.send('ipc', {
      method: 'createLocalServer',
      args: [id, name],
    });

    const result = _makePromise();
    responses[id] = result;
    return result;
  },
  removeLocalServer({name}) {
    const id = _makeId();

    ipcRenderer.send('ipc', {
      method: 'removeLocalServer',
      args: [id, name],
    });

    const result = _makePromise();
    responses[id] = result;
    return result;
  },
  reinstallLocalServer({name}) {
    const id = _makeId();

    ipcRenderer.send('ipc', {
      method: 'reinstallLocalServer',
      args: [id, name],
    });

    const result = _makePromise();
    responses[id] = result;
    return result;
  },
  startServer({name}) {
    const id = _makeId();

    ipcRenderer.send('ipc', {
      method: 'startServer',
      args: [id, name],
    });

    const result = _makePromise();
    responses[id] = result;
    return result;
  },
  stopServer({name}) {
    const id = _makeId();

    ipcRenderer.send('ipc', {
      method: 'stopServer',
      args: [id, name],
    });

    const result = _makePromise();
    responses[id] = result;
    return result;
  },
  createLogStream({name}) {
    const id = _makeId();

    ipcRenderer.send('ipc', {
      method: 'createLogStream',
      args: [id, name],
    });

    const s = new stream.PassThrough();
    let live = true;

    const result = _makePromise();
    result.then(() => {
      if (live) {
        live = false;

        s.end();
      }
    })
    .catch(err => {
      if (live) {
        live = false;

        s.emit('err');
      }
    });
    result.ondata = d => {
      if (live) {
        s.write(d);
      }
    };
    s.close = () => {
      if (live) {
        live = false;

        ipcRenderer.send('ipc', {
          method: 'closeLogStream',
          args: [id],
        });
      }
    }
    responses[id] = result;

    return s;
  },
};
ipcRenderer.on('ipc', (event, e) => {
  const {method} = e;

  if (method === 'response') {
    const {args: [id, err, result]} = e;
    const response = responses[id];
    if (response) {
      if (!err) {
        response.accept(result);
      } else {
        response.reject(err);
      }
      responses[id] = null; // XXX can be delete
    }
  } else if (method === 'data') {
    const {args: [id, data]} = e;
    const response = responses[id];
    if (response) {
      response.ondata(new Buffer(data, 'base64'));
    }
  } /* else {
    console.warn('ipc got unknown method: ' + JSON.stringify(method));
  } */
});

})();
