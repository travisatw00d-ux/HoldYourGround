const io = require('socket.io-client');
const s = io('https://hold-your-ground.fly.dev', { transports: ['websocket'] });
s.on('connect', () => s.emit('register', { username: 'Meta-Dev', password: 'meta123', displayName: 'Meta-Dev' }));
s.on('authSuccess', (d) => {
  const db = require('./server/db');
  db.prepare('UPDATE accounts SET account_type=?, is_admin=? WHERE username=?').run('admin', 1, 'Meta-Dev');
  console.log('Admin account created: ' + d.account.username);
  process.exit(0);
});
s.on('authError', (e) => { console.log('FAIL: ' + e); process.exit(1); });
setTimeout(() => process.exit(1), 15000);
