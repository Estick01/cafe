import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function buildPages(output, version) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(version)) throw new Error('Invalid build version');
  const prefix = `releases/${version}/`;
  const release = join(output, prefix);
  await mkdir(release, { recursive: true });
  for (const folder of ['src', 'css', 'vendor', 'assets/models', 'assets/marca']) {
    await cp(join(root, folder), join(release, folder), { recursive: true });
  }
  for (const file of await readdir(join(root, 'assets'))) {
    if (/^poster-.*\.webp$/.test(file)) await cp(join(root, 'assets', file), join(release, 'assets', file));
  }
  // Document-relative runtime asset URLs must use the same release as the modules.
  async function rewriteAssets(folder) {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const file = join(folder, item.name);
      if (item.isDirectory()) await rewriteAssets(file);
      else if (item.name.endsWith('.js')) {
        const code = await readFile(file, 'utf8');
        await writeFile(file, code.replace(/(['"`])assets\//g, `$1${prefix}assets/`));
      }
    }
  }
  await rewriteAssets(join(release, 'src'));
  // Relative imports stay inside the release tree, including dynamic imports and vendor files.
  const html = (await readFile(join(root, 'index.html'), 'utf8'))
    .replace(/(["'])(?:\.\/)?(src|css|vendor|assets)\//g, `$1./${prefix}$2/`)
    .replace('<head>', `<head>\n  <meta name="build-version" content="${version}">`);
  await writeFile(join(output, 'index.html'), html);
  await writeFile(join(output, '.nojekyll'), '');
  await writeFile(join(output, 'version.json'), JSON.stringify({ version }) + '\n');
  return { version, prefix };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = process.env.GITHUB_SHA || execFileSync('git', ['-c', `safe.directory=${resolve(root, '..').replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const output = resolve(process.argv[2] || join(root, '.pages'));
  await buildPages(output, version);
  console.log(`Pages: ${output} (version ${version})`);
}
