import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalnetConnect4Engine } from '../src/localnet-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..', '..', '..');

function hasLocalnet(): boolean {
  return process.env.FIVE_RPC_URL === 'http://127.0.0.1:8899' || !process.env.FIVE_RPC_URL;
}

function mustPass(step: { name: string; ok: boolean; err: string | null }) {
  assert.equal(step.ok, true, `${step.name} failed: ${step.err || 'unknown error'}`);
}

test('engine create returns valid addresses on localnet', async (t) => {
  if (!hasLocalnet()) {
    t.skip('localnet-only test');
    return;
  }

  const engine = await LocalnetConnect4Engine.create(projectRoot);
  const addresses = engine.getAddresses();

  assert.equal(typeof addresses.scriptAccount, 'string');
  assert.ok(addresses.scriptAccount.length > 20);
  assert.notEqual(addresses.p1, addresses.p2);
});

test('public function coverage: init/open/join/play/getters', async (t) => {
  if (!hasLocalnet()) {
    t.skip('localnet-only test');
    return;
  }

  const engine = await LocalnetConnect4Engine.create(projectRoot);
  (await engine.initGame(2)).forEach(mustPass);

  mustPass(await engine.createOpen());
  mustPass(await engine.join('p2'));
  mustPass(await engine.play('p1', 0));
  mustPass(await engine.play('p2', 1));

  mustPass(await engine.getStatus());
  mustPass(await engine.getTurn());
  mustPass(await engine.getWinner());
});
