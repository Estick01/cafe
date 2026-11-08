#!/usr/bin/env node
/*
 * Servidor estatico minimo: node scripts/servidor.js [puerto] [--capturas]
 * Solo escucha en 127.0.0.1. Con --capturas, ademas, permite a la pagina de pruebas leer los
 * fotogramas de referencia de Cycles y guardar PNG en assets/_checks (ver src/debug/capturas.js).
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const PORT = Number(args.find((arg) => /^\d+$/.test(arg))) || 5192;
const CAPTURES_ENABLED = args.includes('--capturas');
const REFERENCE_DIR = path.join(os.homedir(), 'cafe-3d-render', 'frames');
const CHECKS_DIR = path.join(ROOT, 'assets', '_checks');
const MAX_CAPTURE_BYTES = 24 * 1024 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ktx2': 'image/ktx2',
  '.svg': 'image/svg+xml',
};

function resolvePath(pathname) {
  const target = path.resolve(ROOT, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
  return target === ROOT || target.startsWith(ROOT + path.sep) ? target : null;
}

function serveFile(res, target) {
  const stream = fs.createReadStream(target);
  stream.on('open', () => {
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    stream.pipe(res);
  });
  stream.on('error', () => res.writeHead(404).end('No encontrado'));
}

function saveCapture(req, res, name) {
  const chunks = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size <= MAX_CAPTURE_BYTES) chunks.push(chunk);
  });
  req.on('end', () => {
    if (size > MAX_CAPTURE_BYTES) {
      res.writeHead(413).end('Demasiado grande');
      return;
    }
    fs.mkdirSync(CHECKS_DIR, { recursive: true });
    fs.writeFile(path.join(CHECKS_DIR, `${name}.png`), Buffer.concat(chunks), (error) => {
      if (error) {
        console.error('No se pudo guardar la captura', error);
        res.writeHead(500).end('Error al guardar');
        return;
      }
      res.writeHead(204).end();
    });
  });
}

function handleCaptureRoutes(req, res, pathname) {
  const reference = pathname.match(/^\/__ref\/(f_\d{4}\.png)$/);
  if (reference && req.method === 'GET') {
    serveFile(res, path.join(REFERENCE_DIR, reference[1]));
    return true;
  }
  const check = pathname.match(/^\/__check\/([\w.-]{1,64})$/);
  if (check && req.method === 'POST') {
    saveCapture(req, res, check[1]);
    return true;
  }
  return false;
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Solicitud no valida');
    return;
  }
  if (CAPTURES_ENABLED && handleCaptureRoutes(req, res, pathname)) return;
  const target = resolvePath(pathname);
  if (!target || req.method !== 'GET') {
    res.writeHead(target ? 405 : 400).end('Solicitud no valida');
    return;
  }
  serveFile(res, target);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Landing 3D en http://localhost:${PORT}/${CAPTURES_ENABLED ? ' (capturas activas)' : ''}`);
});
