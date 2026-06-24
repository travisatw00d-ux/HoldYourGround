import { registerEvents } from './net-events.js';

let socket = null;

export function getSocket() { return socket; }

export function connect() {
  const serverUrl = window.location.hostname === 'iolegends.com' || window.location.hostname === 'www.iolegends.com'
    ? 'wss://server.iolegends.com'
    : undefined;
  socket = io(serverUrl, { transports: ['websocket'] });

  const MY_BUILD = window.BUILD || '';
  setInterval(() => {
    fetch('/version', { cache: 'no-store' }).then(r => r.text()).then(t => {
      const v = t.trim();
      if (MY_BUILD && v !== MY_BUILD) { console.log('[HYG] new build ' + v + ' (was ' + MY_BUILD + '), reloading'); location.reload(); }
    }).catch(() => {});
  }, 8000);

  registerEvents(socket);
  return socket;
}
