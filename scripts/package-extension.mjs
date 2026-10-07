import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = packageJson.version;
const distDir = path.join(root, 'dist');
const zipName = `sally-extension-v${version}.zip`;
const zipPath = path.join(distDir, zipName);
const includePaths = [
  'manifest.json',
  'background',
  'content-scripts',
  'icons',
  'popup',
  'sidepanel',
  'shared',
];

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

const result = spawnSync('zip', ['-r', zipPath, ...includePaths], {
  cwd: root,
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Packaged ${zipName}`);
