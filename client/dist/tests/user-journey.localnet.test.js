import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalnetConnect4Engine, constants } from '../src/localnet-engine.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..', '..', '..');
test('full localnet user journey: c4 + invite + timeout', async () => {
    const engine = await LocalnetConnect4Engine.create(projectRoot);
    const setup = await engine.initGame(2);
    assert.equal(setup.every((s) => s.ok), true);
    let state = engine.getState();
    // Open C4 game
    assert.equal((await engine.createOpen('c4')).ok, true);
    assert.equal((await engine.join('p2')).ok, true);
    assert.equal((await engine.playC4('p1', 0)).ok, true);
    assert.equal((await engine.playC4('p2', 1)).ok, true);
    assert.equal((await engine.playC4('p1', 0)).ok, true);
    assert.equal((await engine.playC4('p2', 1)).ok, true);
    assert.equal((await engine.playC4('p1', 0)).ok, true);
    assert.equal((await engine.playC4('p2', 1)).ok, true);
    assert.equal((await engine.playC4('p1', 0)).ok, true);
    state = engine.getState();
    assert.equal(state.match.status, constants.MATCH_P1_WIN);
    // Invite flow + rejection
    assert.equal((await engine.createInvite('c4')).ok, true);
    const wrongJoin = await engine.join('p3');
    assert.equal(wrongJoin.ok, false);
    assert.equal((await engine.join('p2')).ok, true);
    // Timeout flow
    assert.equal((await engine.playC4('p1', 2)).ok, true);
    await engine.waitForTimeoutWindow();
    const timeoutClaim = await engine.claimTimeout('p1');
    assert.equal(timeoutClaim.ok, true);
    state = engine.getState();
    assert.equal(state.match.status, constants.MATCH_P1_WIN);
});
