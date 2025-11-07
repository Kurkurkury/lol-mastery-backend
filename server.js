// server.js – einfacher HTTP-Server + API
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const store = require('./datastore');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(body);
}

function serveStatic(req, res) {
  let reqPath = url.parse(req.url).pathname;
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(reqPath));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'Not Found');
    const ext = path.extname(filePath).toLowerCase();
    const map = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8'
    };
    send(res, 200, data, map[ext] || 'application/octet-stream');
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', chunk => { buf += chunk; if (buf.length > 5e6) req.destroy(); });
    req.on('end', () => {
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);

  // --- API ---
  if (pathname.startsWith('/api/')) {
    try {
      if (req.method === 'GET' && pathname === '/api/all') {
        return send(res, 200, JSON.stringify(store.readAll()), 'application/json; charset=utf-8');
      }
      if (req.method === 'GET' && pathname === '/api/accounts') {
        const all = store.readAll();
        const accounts = [...new Set(all.map(r => r.account))].sort((a, b) => a.localeCompare(b, 'de'));
        return send(res, 200, JSON.stringify(accounts), 'application/json; charset=utf-8');
      }
      if (req.method === 'GET' && pathname === '/api/totals') {
        return send(res, 200, JSON.stringify(store.totalsByChampion()), 'application/json; charset=utf-8');
      }
      if (req.method === 'GET' && pathname === '/api/account') {
        const name = query.name || '';
        return send(res, 200, JSON.stringify(store.listByAccount(name)), 'application/json; charset=utf-8');
      }
      if (req.method === 'POST' && pathname === '/api/upsert') {
        const body = await readJsonBody(req);
        const rec = store.upsert({
          account: body.account,
          champion: body.champion,
          mastery: Number(body.mastery)
        });
        return send(res, 200, JSON.stringify(rec), 'application/json; charset=utf-8');
      }
      if (req.method === 'POST' && pathname === '/api/remove') {
        const body = await readJsonBody(req);
        const ok = store.remove(body.account, body.champion);
        return send(res, 200, JSON.stringify({ ok }), 'application/json; charset=utf-8');
      }
      return send(res, 404, 'API Not Found');
    } catch (e) {
      return send(res, 500, JSON.stringify({ error: e.message }), 'application/json; charset=utf-8');
    }
  }

  // --- Static ---
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Webserver läuft: http://localhost:${PORT}`);
});
