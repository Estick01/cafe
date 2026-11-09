import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPages } from '../scripts/build-pages.mjs';

test('Pages versions entries, nested modules, runtime assets and logo under a project subpath', async () => {
  const output = await mkdtemp(join(tmpdir(), 'coffee-pages-'));
  try {
    const { prefix } = await buildPages(output, 'commit-test');
    const html = await readFile(join(output, 'index.html'), 'utf8');
    assert.match(html, /content="commit-test"/);
    assert.match(html, /href="\.\/releases\/commit-test\/css\/base.css"/);
    assert.match(html, /import\('\.\/releases\/commit-test\/src\/app.js'\)/);
    assert.match(html, /href="#tienda"/);
    const moduleURL = new URL(`${prefix}src/app.js`, 'https://example.org/cafe/');
    const imported = new URL('./marca.js', moduleURL);
    assert.equal(imported.pathname, '/cafe/releases/commit-test/src/marca.js');
    const brand = await readFile(join(output, prefix, 'src/marca.js'), 'utf8');
    assert.ok(brand.includes(`${prefix}assets/marca/logo-taza.svg`));
    await access(join(output, prefix, 'assets/marca/logo-taza.svg'));
    await access(join(output, prefix, 'assets/models/manifest.json'));
    await access(join(output, prefix, 'vendor/three-0.170.0/build/three.module.min.js'));
  } finally { await rm(output, { recursive: true, force: true }); }
});
