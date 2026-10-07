// Starts the whole local stack: web UI, API server and, when installed, Rizzo Flow.
// Rizzo Flow lives outside this repo (its own Python env and a 4.4 GB model); its folder comes from
// RIZZO_FLOW_DIR in .env. Without it we warn and start the rest, so the app stays usable.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

try {
  process.loadEnvFile('.env');
} catch {
  /* no .env: fine */
}

const raw = process.env.RIZZO_FLOW_DIR?.trim();
const dir = raw ? path.resolve(raw.replace(/^~(?=$|\/)/, os.homedir())) : null;

const commands = ['"npm:dev:web"', '"npm:dev:api"'];
const names = ['web', 'api'];
const colors = ['blue', 'magenta'];

if (!dir) {
  console.warn('[dev:full] RIZZO_FLOW_DIR non impostato in .env: avvio senza Rizzo Flow.');
} else if (!fs.existsSync(path.join(dir, 'pyproject.toml'))) {
  console.warn(`[dev:full] Rizzo Flow non trovato in ${dir}: avvio senza Rizzo Flow.`);
} else {
  const args = process.env.RIZZO_SERVE_ARGS ?? '--size 4b';
  commands.push(JSON.stringify(`cd ${JSON.stringify(dir)} && uv run rizzo serve ${args}`));
  names.push('rizzo');
  colors.push('green');
}

const child = spawn(
  'npx',
  ['concurrently', '-k', '-n', names.join(','), '-c', colors.join(','), ...commands],
  { stdio: 'inherit', shell: true },
);
child.on('exit', (code) => process.exit(code ?? 0));
