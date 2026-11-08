#!/usr/bin/env node
'use strict';
/*
 * Regenera la secuencia de imágenes de la landing a partir de cualquier mp4.
 *
 *   node scripts/generar-frames.js <video.mp4> [--width 960] [--quality 75] [--step 1] [--ffmpeg ruta]
 *
 * Produce: assets/frames/NNNN.webp, assets/poster-inicio.webp, assets/poster-final.webp
 * y js/frames-config.js (el único objeto con los datos de la fuente de frames).
 * Solo usa la CPU: ffmpeg decodifica y codifica por software, sin GPU.
 */
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const FRAMES_DIR = path.join(ASSETS, 'frames');
const TMP_DIR = path.join(ASSETS, '.frames-tmp');
const CONFIG_FILE = path.join(ROOT, 'js', 'frames-config.js');
const DEFAULT_FFMPEG = 'C:\\Users\\ccsb1\\OneDrive\\Escritorio\\claude\\video-bots\\herramientas\\node_modules\\ffmpeg-static\\ffmpeg.exe';
const MAX_WIDTH = 1920;
const PAD = 4;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { input: null, width: null, quality: 75, step: 1, ffmpeg: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      if (opts.input) fail(`argumento inesperado: ${arg}`);
      opts.input = arg;
      continue;
    }
    const key = arg.slice(2);
    if (!(key in opts) || key === 'input') fail(`opción desconocida: ${arg}`);
    const value = argv[i += 1];
    if (value === undefined) fail(`falta el valor de ${arg}`);
    opts[key] = key === 'ffmpeg' ? value : Number(value);
  }
  return opts;
}

function validate(opts) {
  if (!opts.input) {
    fail('uso: node scripts/generar-frames.js <video.mp4> [--width 960] [--quality 75] [--step 1] [--ffmpeg ruta]');
  }
  if (!fs.existsSync(opts.input)) fail(`no existe el video: ${opts.input}`);
  if (opts.width !== null && !(Number.isInteger(opts.width) && opts.width >= 160 && opts.width <= MAX_WIDTH)) {
    fail(`--width debe ser un entero entre 160 y ${MAX_WIDTH}`);
  }
  if (!(opts.quality >= 1 && opts.quality <= 100)) fail('--quality debe estar entre 1 y 100');
  if (!(Number.isInteger(opts.step) && opts.step >= 1 && opts.step <= 12)) fail('--step debe ser un entero entre 1 y 12');
}

function resolveFfmpeg(explicit) {
  if (explicit) return explicit;
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  return fs.existsSync(DEFAULT_FFMPEG) ? DEFAULT_FFMPEG : 'ffmpeg';
}

function run(bin, args) {
  return new Promise((resolve) => {
    execFile(bin, args, { maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ error, stderr: String(stderr) });
    });
  });
}

/* ffmpeg sin salida termina con error pero imprime los metadatos en stderr. */
async function probe(ffmpeg, input) {
  const { error, stderr } = await run(ffmpeg, ['-hide_banner', '-i', input]);
  if (error && error.code === 'ENOENT') fail(`no se encontró ffmpeg en: ${ffmpeg}`);
  const size = stderr.match(/Video:.*?[\s,](\d{2,5})x(\d{2,5})[\s,[]/);
  const fps = stderr.match(/([\d.]+) fps/);
  const duration = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!size || !fps || !duration) fail('no se pudieron leer las dimensiones, fps o duración del video');
  return {
    width: Number(size[1]),
    height: Number(size[2]),
    fps: Number(fps[1]),
    duration: Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]),
  };
}

function buildFilter(opts, info, width) {
  const scale = `scale=${width}:-2:flags=lanczos`;
  return opts.step > 1 ? `fps=${info.fps / opts.step},${scale}` : scale;
}

async function extract(ffmpeg, opts, info, width) {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const { error, stderr } = await run(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', opts.input,
    '-vf', buildFilter(opts, info, width), '-an',
    '-c:v', 'libwebp', '-quality', String(opts.quality), '-compression_level', '4',
    path.join(TMP_DIR, `%0${PAD}d.webp`),
  ]);
  if (error) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fail(`ffmpeg no pudo extraer los frames:\n${stderr}`);
  }
}

function listFrames(dir) {
  return fs.readdirSync(dir).filter((name) => name.endsWith('.webp')).sort();
}

/* Se sustituye la carpeta solo cuando la extracción completa ya tuvo éxito. */
function publish(names) {
  if (names.length === 0) fail('ffmpeg no produjo ningún frame');
  fs.copyFileSync(path.join(TMP_DIR, names[0]), path.join(ASSETS, 'poster-inicio.webp'));
  fs.copyFileSync(path.join(TMP_DIR, names[names.length - 1]), path.join(ASSETS, 'poster-final.webp'));
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  fs.renameSync(TMP_DIR, FRAMES_DIR);
}

function folderBytes(dir) {
  return fs.readdirSync(dir).reduce((sum, name) => sum + fs.statSync(path.join(dir, name)).size, 0);
}

function writeConfig(config) {
  const body = JSON.stringify(config, null, 2);
  fs.writeFileSync(CONFIG_FILE, `/* Generado por scripts/generar-frames.js. No editar a mano. */\nwindow.CafeFrames = Object.freeze(${body});\n`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  validate(opts);
  const ffmpeg = resolveFfmpeg(opts.ffmpeg);
  const info = await probe(ffmpeg, opts.input);
  const width = opts.width || Math.min(info.width, MAX_WIDTH);
  const evenWidth = width - (width % 2);
  const height = Math.round((info.height * evenWidth) / info.width / 2) * 2;

  console.log(`Fuente: ${info.width}x${info.height}, ${info.fps} fps, ${info.duration} s`);
  console.log(`Salida: ${evenWidth}x${height}, WebP calidad ${opts.quality}, 1 de cada ${opts.step} frames`);
  await extract(ffmpeg, opts, info, evenWidth);
  const names = listFrames(TMP_DIR);
  publish(names);

  writeConfig({
    basePath: 'assets/frames/',
    extension: 'webp',
    pad: PAD,
    firstIndex: 1,
    count: names.length,
    width: evenWidth,
    height,
    duration: info.duration,
    source: path.basename(opts.input),
  });

  const bytes = folderBytes(FRAMES_DIR);
  const mb = (bytes / (1024 * 1024)).toFixed(2);
  console.log(`Listo: ${names.length} frames, ${mb} MiB en total (${Math.round(bytes / names.length / 1024)} KiB por frame).`);
}

main().catch((error) => fail(error.message));
