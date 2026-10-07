import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const packagePath = path.join(root, 'package.json');
const packageLockPath = path.join(root, 'package-lock.json');
const manifestPath = path.join(root, 'manifest.json');
const footerFiles = [
  path.join(root, 'popup', 'popup.html'),
  path.join(root, 'sidepanel', 'sidepanel.html'),
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function assertChromeVersion(version) {
  if (!/^\d+(?:\.\d+){0,3}$/.test(version)) {
    throw new Error(`Invalid Chrome extension version: ${version}`);
  }
}

function bumpVersion(version, part) {
  const pieces = version.split('.').map((piece) => Number(piece));
  while (pieces.length < 3) pieces.push(0);

  const indexByPart = { major: 0, minor: 1, patch: 2 };
  const index = indexByPart[part];
  if (typeof index !== 'number') {
    return part;
  }

  pieces[index] += 1;
  for (let i = index + 1; i < pieces.length; i += 1) {
    pieces[i] = 0;
  }

  return pieces.slice(0, 3).join('.');
}

const packageJson = readJson(packagePath);
const requestedVersion = process.argv[2];
const nextVersion = requestedVersion
  ? bumpVersion(packageJson.version, requestedVersion)
  : packageJson.version;

assertChromeVersion(nextVersion);

packageJson.version = nextVersion;
writeJson(packagePath, packageJson);

if (fs.existsSync(packageLockPath)) {
  const packageLock = readJson(packageLockPath);
  packageLock.version = nextVersion;
  if (packageLock.packages?.['']) {
    packageLock.packages[''].version = nextVersion;
  }
  writeJson(packageLockPath, packageLock);
}

const manifest = readJson(manifestPath);
manifest.version = nextVersion;
writeJson(manifestPath, manifest);

for (const filePath of footerFiles) {
  const html = fs.readFileSync(filePath, 'utf8');
  fs.writeFileSync(
    filePath,
    html.replace(/Sally by HeySalad® v\d+(?:\.\d+){0,3}/g, `Sally by HeySalad® v${nextVersion}`),
  );
}

console.log(`Sally extension version synced to ${nextVersion}`);
