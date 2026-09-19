'use strict';
// One-time, insert-only import from the retired Mac viewer. The source remains
// intact; values are never logged or sent anywhere by this migration.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');

function loopbackPort(bytes) {
  // WebKit's serialized SecurityOrigin: scheme, host and optional uint16 port,
  // repeated for the top and frame origins. Reject every other origin shape.
  const prefix = Buffer.from('04000000016874747009000000013132372e302e302e3101', 'hex');
  const length = prefix.length + 2;
  if (bytes.length !== length * 2 || !bytes.subarray(0, prefix.length).equals(prefix) || !bytes.subarray(0, length).equals(bytes.subarray(length))) return null;
  const port = bytes.readUInt16LE(prefix.length);
  return port >= 1024 && port !== 18790 ? port : null;
}

function exportViewerStorage(home = os.homedir()) {
  const output = path.join(home, '.config/starnet-remote/legacy-viewer-storage.json');
  if (fs.existsSync(output)) return;
  const root = path.join(home, 'Library/WebKit/com.thatlev.starnet.remote/WebsiteData/Default');
  if (!fs.existsSync(root)) return;
  const { DatabaseSync } = require('node:sqlite');
  const origins = {};
  for (const top of fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory())) {
    for (const frame of fs.readdirSync(path.join(root, top.name), { withFileTypes: true }).filter(e => e.isDirectory())) {
      const directory = path.join(root, top.name, frame.name), origin = path.join(directory, 'origin');
      if (!fs.existsSync(origin)) continue;
      const port = loopbackPort(fs.readFileSync(origin)), database = path.join(directory, 'LocalStorage/localstorage.sqlite3');
      if (!port || !fs.existsSync(database)) continue;
      const db = new DatabaseSync(database, { readOnly: true });
      try {
        origins[port] = db.prepare('SELECT key, value FROM ItemTable').all()
          .filter(row => /^(starnet|skynet)[.:_-]/i.test(row.key))
          .map(row => [row.key, typeof row.value === 'string' ? row.value : Buffer.from(row.value).toString('utf16le')]);
      } finally { db.close(); }
    }
  }
  if (!Object.keys(origins).length) return;
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  const temp = output + '.tmp';
  const fd = fs.openSync(temp, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(origins)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, output);
}

if (require.main === module) exportViewerStorage();
module.exports = { exportViewerStorage, loopbackPort };
