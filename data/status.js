// Status-Storage für data/status.json
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'data', 'status.json');

function readStatus() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { status: 'idle', updatedAt: null, meta: {} };
  }
}

function writeStatus(status, meta = {}) {
  const next = {
    ...readStatus(),
    status,
    meta,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

module.exports = { getStatus: readStatus, setStatus: writeStatus };
