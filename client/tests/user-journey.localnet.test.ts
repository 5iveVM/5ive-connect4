import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalnetConnect4Engine, constants } from '../src/localnet-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..', '..', '..');

function mustPass(step: { name: string; ok: boolean; err: string | null }) {
  assert.equal(step.ok, true, `${step.name} failed: ${step.err || 'unknown error'}`);
}

test('full localnet user journey with all public endpoints', async () => {
  const engine = await LocalnetConnect4Engine.create(projectRoot);
  engine.setupSteps.forEach(mustPass);
  (await engine.initGame(2)).forEach(mustPass);

  mustPass(await engine.createOpen());
  mustPass(await engine.join('p2'));
  mustPass(await engine.play('p1', 0));
  mustPass(await engine.play('p2', 1));
  mustPass(await engine.play('p1', 0));
  mustPass(await engine.play('p2', 1));
  mustPass(await engine.play('p1', 0));
  mustPass(await engine.play('p2', 1));
  mustPass(await engine.play('p1', 0));

  mustPass(await engine.getStatus());
  mustPass(await engine.getTurn());
  mustPass(await engine.getWinner());
  assert.equal(engine.getState().match.status, constants.MATCH_P1_WIN);

  mustPass(await engine.createInvite());
  const wrongJoin = await engine.join('p3');
  assert.equal(wrongJoin.ok, false);
  mustPass(await engine.join('p2'));

  mustPass(await engine.play('p1', 2));
  await engine.waitForTimeoutWindow();
  mustPass(await engine.claimTimeout('p1'));

  mustPass(await engine.createOpen());
  mustPass(await engine.cancel());
  assert.equal(engine.getState().match.status, constants.MATCH_CANCELLED);

  mustPass(await engine.createOpen());
  mustPass(await engine.join('p2'));
  mustPass(await engine.resign('p2'));
  assert.equal(engine.getState().match.status, constants.MATCH_P1_WIN);
});
