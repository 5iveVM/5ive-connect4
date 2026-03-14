import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { LocalnetConnect4Engine } from './src/localnet-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..', '..');

function hasFailedStep(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((entry) => hasFailedStep(entry));

  const record = value as Record<string, unknown>;
  if ('ok' in record && record.ok === false) return true;

  return Object.values(record).some((entry) => hasFailedStep(entry));
}

async function main() {
  const engine = await LocalnetConnect4Engine.create(projectRoot);

  const setup = await engine.initGame(10);
  const create = await engine.createOpen('c4');
  const join = await engine.join('p2');

  const moves = [];
  moves.push(await engine.playC4('p1', 0));
  moves.push(await engine.playC4('p2', 1));
  moves.push(await engine.playC4('p1', 0));
  moves.push(await engine.playC4('p2', 1));
  moves.push(await engine.playC4('p1', 0));
  moves.push(await engine.playC4('p2', 1));
  moves.push(await engine.playC4('p1', 0));

  const state = engine.getState();
  const addresses = engine.getAddresses();

  const result = { setup, create, join, moves, state, addresses };
  console.log(JSON.stringify(result, null, 2));

  if (hasFailedStep(result)) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
