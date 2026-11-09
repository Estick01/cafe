import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
test('todos los estilos locales declarados en la landing existen', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const styles = [...html.matchAll(/href="(css\/[^\"]+\.css)"/g)].map(match => match[1]);
  assert.ok(styles.length >= 4);
  for (const file of styles) assert.ok(fs.existsSync(path.join(root, file)), file);
});
test('los modulos de escenas e interfaz tienen sus dependencias locales', () => {
  const walk = folder => fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? walk(file) : file.endsWith('.js') ? [file] : [];
  });
  for (const file of walk(path.join(root, 'src'))) {
    const source = fs.readFileSync(file, 'utf8');
    const imports = [...source.matchAll(/(?:from\s*|import\s*\(|importOptional\s*\()(['"])(\.[^'"]+\.js)\1/g)];
    for (const [, , relative] of imports) {
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), relative)), `${path.relative(root, file)} -> ${relative}`);
    }
  }
});
