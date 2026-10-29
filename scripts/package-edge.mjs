import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const includeDirs = ['background', 'content-scripts', 'icons', 'popup', 'sidepanel', 'shared'];
const outputDir = path.join(root, 'store-assets', 'edge');
const distDir = path.join(root, 'dist');

const chromeBranding = /\bchrome extension\b|\bwork in chrome\b|\badd to chrome\b|\bchrome web store\b/i;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertSally(value, field) {
  if (typeof value !== 'string' || !value.includes('Sally')) {
    throw new Error(`${field} must use the name Sally`);
  }
  const withoutCompany = value.replaceAll('HeySalad', '');
  if (/\bSal\b/.test(withoutCompany)) {
    throw new Error(`${field} must say Sally, not Sal`);
  }
}

function prepareManifest(sourcePath) {
  const manifest = readJson(sourcePath);
  // Partner Center rejects a Chrome Web Store update URL. The public key is
  // omitted so Edge assigns this listing its own extension id.
  delete manifest.update_url;
  delete manifest.key;

  if (manifest.manifest_version !== 3) {
    throw new Error('New Microsoft Edge Add-ons submissions must use manifest_version 3');
  }
  if (!/^\d+(?:\.\d+){0,3}$/.test(manifest.version || '')) {
    throw new Error(`Invalid extension version: ${manifest.version}`);
  }

  // Partner Center rejects short_name longer than 12 characters. The Chrome
  // manifest keeps "Sally by HeySalad®". Only this Edge package uses "Sally".
  manifest.short_name = 'Sally';

  assertSally(manifest.name, 'name');
  assertSally(manifest.short_name, 'short_name');
  assertSally(manifest.action?.default_title, 'action.default_title');
  if ([...manifest.short_name].length > 12) {
    throw new Error(`short_name must be 12 characters or fewer (got ${[...manifest.short_name].length})`);
  }

  for (const field of ['name', 'short_name', 'description']) {
    const value = manifest[field];
    if (typeof value === 'string' && /\bChrome\b/.test(value)) {
      throw new Error(`${field} must not mention Chrome in the Edge package`);
    }
  }
  if (/\bChrome\b/.test(manifest.action?.default_title || '')) {
    throw new Error('action.default_title must not mention Chrome in the Edge package');
  }
  if (typeof manifest.description !== 'string' || manifest.description.length < 1 || manifest.description.length > 132) {
    throw new Error(`description must be 1-132 characters (got ${manifest.description?.length ?? 0})`);
  }
  for (const size of ['16', '32', '48', '128']) {
    const iconPath = manifest.icons?.[size];
    if (!iconPath || !fs.existsSync(path.join(root, iconPath))) {
      throw new Error(`missing icons.${size}`);
    }
  }
  if (!Array.isArray(manifest.permissions) || manifest.permissions.length === 0) {
    throw new Error('manifest is missing permissions');
  }
  if (!manifest.background?.service_worker) {
    throw new Error('manifest is missing a service worker');
  }
  return manifest;
}

function copyFiltered(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (entry === '.gitkeep' || entry === '.DS_Store' || entry.endsWith('.zip')) continue;
      copyFiltered(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.copyFileSync(src, dest);
}

function assertPackageText(stage) {
  const problems = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(js|html|css|json|svg)$/.test(entry.name) || entry.name.endsWith('.min.js')) continue;
      const text = fs.readFileSync(full, 'utf8');
      const relative = path.relative(stage, full);
      if (chromeBranding.test(text)) {
        problems.push(`${relative} still describes Sally as a Chrome extension`);
      }
      const withoutCompany = text.replaceAll('HeySalad', '');
      if (/\bSal\b/.test(withoutCompany)) {
        problems.push(`${relative} uses Sal instead of Sally`);
      }
    }
  }

  walk(stage);
  if (problems.length > 0) {
    throw new Error(problems.join('\n'));
  }
}

function zipStage(stage, zipPath) {
  fs.rmSync(zipPath, { force: true });
  const result = spawnSync('zip', ['-r', '-X', zipPath, '.'], {
    cwd: stage,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const manifest = prepareManifest(path.join(root, 'manifest.json'));
const zipName = `sally-by-heysalad-edge-${manifest.version}.zip`;
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'sally-edge-'));

try {
  fs.writeFileSync(path.join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const dir of includeDirs) {
    const source = path.join(root, dir);
    if (!fs.existsSync(source)) {
      throw new Error(`missing extension directory: ${dir}`);
    }
    copyFiltered(source, path.join(stage, dir));
  }
  assertPackageText(stage);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(distDir, { recursive: true });
  const zipPath = path.join(outputDir, zipName);
  const distPath = path.join(distDir, zipName);
  zipStage(stage, zipPath);
  fs.copyFileSync(zipPath, distPath);

  const listing = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  if (listing.status !== 0) {
    throw new Error(listing.stderr || 'unable to list Edge zip');
  }
  const entries = listing.stdout.split('\n').filter(Boolean);
  if (!entries.includes('manifest.json')) {
    throw new Error('Edge zip is missing manifest.json at the package root');
  }
  if (entries.some((entry) => entry.startsWith('/') || entry.includes('..') || entry.includes('\\'))) {
    throw new Error('Edge zip contains an unsafe path');
  }
  const forbidden = entries.filter((entry) => (
    entry.startsWith('_metadata/')
    || entry.includes('node_modules/')
    || entry.endsWith('.md')
    || entry.endsWith('.zip')
  ));
  if (forbidden.length > 0) {
    throw new Error(`Edge zip contains files Partner Center should not receive: ${forbidden.join(', ')}`);
  }

  const packedManifest = JSON.parse(spawnSync('unzip', ['-p', zipPath, 'manifest.json'], { encoding: 'utf8' }).stdout);
  if (packedManifest.update_url || packedManifest.key) {
    throw new Error('Edge manifest still contains update_url or key');
  }
  if (
    packedManifest.version !== manifest.version
    || packedManifest.name !== manifest.name
    || packedManifest.short_name !== 'Sally'
  ) {
    throw new Error('Packed manifest does not match the Edge manifest');
  }

  console.log(`Edge package: ${zipPath}`);
  console.log(`Edge package copy: ${distPath}`);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
