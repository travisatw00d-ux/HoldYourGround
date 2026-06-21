const db = require('/app/server/db');
db.prepare('UPDATE accounts SET account_type=?, is_admin=? WHERE username=?').run('admin', 1, 'Meta-Dev');
console.log('done');
