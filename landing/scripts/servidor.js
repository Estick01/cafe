#!/usr/bin/env node
'use strict';
/* Servidor estático mínimo para ver la landing en local: node scripts/servidor.js [puerto] */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2]) || 5191;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function resolvePath(url) {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const target = path.resolve(ROOT, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
  return target === ROOT || target.startsWith(ROOT + path.sep) ? target : null;
}

const server = http.createServer((req, res) => {
  let target;
  try {
    target = resolvePath(req.url);
  } catch {
    target = null;
  }
  if (!target) {
    res.writeHead(400).end('Solicitud no válida');
    return;
  }
  const stream = fs.createReadStream(target);
  stream.on('open', () => {
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    stream.pipe(res);
  });
  stream.on('error', () => res.writeHead(404).end('No encontrado'));
});

server.listen(PORT, '127.0.0.1', () => console.log(`Landing en http://localhost:${PORT}/`));
