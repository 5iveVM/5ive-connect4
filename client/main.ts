import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { LocalnetConnect4Engine } from './src/localnet-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..', '..');

async function main() {
  const engine = await LocalnetConnect4Engine.create(projectRoot);
  const setup = await engine.initGame(2);
  const create = await engine.createOpen();
  const join = await engine.join('p2');

  const moves = [];
  moves.push(await engine.play('p1', 0));
  moves.push(await engine.play('p2', 1));
  moves.push(await engine.play('p1', 0));
  moves.push(await engine.play('p2', 1));
  moves.push(await engine.play('p1', 0));
  moves.push(await engine.play('p2', 1));
  moves.push(await engine.play('p1', 0));

  const status = await engine.getStatus();
  const turn = await engine.getTurn();
  const winner = await engine.getWinner();

  console.log(JSON.stringify({ setup, create, join, moves, status, turn, winner, state: engine.getState(), addresses: engine.getAddresses() }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
