import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { LocalnetConnect4Engine } from './src/localnet-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..', '..');

async function run() {
  const engine = await LocalnetConnect4Engine.create(projectRoot);
  const steps: unknown[] = [];

  steps.push({ setup: await engine.initGame(2) });
  steps.push({ createOpen: await engine.createOpen() });
  steps.push({ join: await engine.join('p2') });
  steps.push({ m1: await engine.play('p1', 0) });
  steps.push({ m2: await engine.play('p2', 1) });
  steps.push({ m3: await engine.play('p1', 0) });
  steps.push({ m4: await engine.play('p2', 1) });
  steps.push({ m5: await engine.play('p1', 0) });
  steps.push({ m6: await engine.play('p2', 1) });
  steps.push({ m7: await engine.play('p1', 0) });

  steps.push({ status: await engine.getStatus() });
  steps.push({ turn: await engine.getTurn() });
  steps.push({ winner: await engine.getWinner() });

  console.log(JSON.stringify({ steps, finalState: engine.getState(), addresses: engine.getAddresses() }, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
