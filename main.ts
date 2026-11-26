// Entrypoint for Canyon Dawn Patrol 3D (Node 22, standard library only).
// Copies game/ and screenshots/ to the output directory and writes deterministic dossier.json.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const outGameDir = join(outDir, 'game');
const outShotsDir = join(outDir, 'screenshots');

mkdirSync(outDir, { recursive: true });
rmSync(outGameDir, { recursive: true, force: true });
rmSync(outShotsDir, { recursive: true, force: true });

cpSync(join(rootDir, 'game'), outGameDir, { recursive: true });
mkdirSync(outShotsDir, { recursive: true });
if (existsSync(join(rootDir, 'screenshots'))) {
  cpSync(join(rootDir, 'screenshots'), outShotsDir, { recursive: true });
}

const dossierBytes = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

writeFileSync(join(outDir, 'dossier.json'), dossierBytes);
