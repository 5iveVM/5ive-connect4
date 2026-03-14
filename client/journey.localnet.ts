import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { LocalnetConnect4Engine } from './src/localnet-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..', '..');

async function run() {
  const engine = await LocalnetConnect4Engine.create(projectRoot);
  const steps: unknown[] = [];

  steps.push({ setup: await engine.initGame(5) });
  steps.push({ createOpenC4: await engine.createOpen('c4') });
  steps.push({ joinC4: await engine.join('p2') });
  steps.push({ c41: await engine.playC4('p1', 0) });
  steps.push({ c42: await engine.playC4('p2', 1) });
  steps.push({ c43: await engine.playC4('p1', 0) });
  steps.push({ c44: await engine.playC4('p2', 1) });
  steps.push({ c45: await engine.playC4('p1', 0) });
  steps.push({ c46: await engine.playC4('p2', 1) });
  steps.push({ c47: await engine.playC4('p1', 0) });

  console.log(
    JSON.stringify(
      {
        steps,
        finalState: engine.getState(),
        addresses: engine.getAddresses(),
        readbacks: await engine.readOnchainSummary(),
      },
      null,
      2
    )
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
