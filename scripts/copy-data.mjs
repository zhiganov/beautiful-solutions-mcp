import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(projectRoot, 'src/data');
const destination = resolve(projectRoot, 'dist/data');

await mkdir(destination, { recursive: true });
await Promise.all([
  cp(resolve(source, 'toolbox.json'), resolve(destination, 'toolbox.json')),
  cp(resolve(source, 'source-manifest.json'), resolve(destination, 'source-manifest.json')),
  cp(resolve(source, 'method-cards.json'), resolve(destination, 'method-cards.json')),
  cp(resolve(source, 'method-card-manifest.json'), resolve(destination, 'method-card-manifest.json')),
]);
