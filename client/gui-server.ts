import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { LocalnetConnect4Engine, type Role } from './src/localnet-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..', '..');
const htmlPath = resolve(projectRoot, 'client', 'gui', 'index.html');

let enginePromise: Promise<LocalnetConnect4Engine> | null = null;
let lastAction: unknown = null;

function getEngine(): Promise<LocalnetConnect4Engine> {
  if (!enginePromise) {
    enginePromise = LocalnetConnect4Engine.create(projectRoot);
  }
  return enginePromise;
}

function json(res: any, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function parseBody(req: any): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, any>;
}

function asRole(v: unknown): Role {
  if (v === 'p2') return 'p2';
  if (v === 'p3') return 'p3';
  return 'p1';
}

async function handler(req: any, res: any) {
  try {
    if (req.method === 'GET' && req.url === '/') {
      const html = await readFile(htmlPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method !== 'POST' || !req.url.startsWith('/api/')) {
      json(res, 404, { error: 'not found' });
      return;
    }

    const engine = await getEngine();
    const body = await parseBody(req);

    if (req.url === '/api/state') {
      json(res, 200, {
        message: 'state loaded',
        state: engine.getState(),
        addresses: engine.getAddresses(),
        lastAction,
      });
      return;
    }

    if (req.url === '/api/init') {
      const timeout = Number(body.turnTimeoutSecs || 120);
      const result = await engine.initGame(timeout);
      lastAction = { kind: 'init', result };
      json(res, 200, { message: 'initialized', result, state: engine.getState(), addresses: engine.getAddresses() });
      return;
    }

    if (req.url === '/api/create-open') {
      const mode = 'c4';
      const result = await engine.createOpen(mode);
      lastAction = { kind: 'create-open', mode, result };
      json(res, 200, { message: 'open match created', result, state: engine.getState(), addresses: engine.getAddresses() });
      return;
    }

    if (req.url === '/api/create-invite') {
      const mode = 'c4';
      const result = await engine.createInvite(mode);
      lastAction = { kind: 'create-invite', mode, result };
      json(res, 200, { message: 'invite match created', result, state: engine.getState(), addresses: engine.getAddresses() });
      return;
    }

    if (req.url === '/api/join') {
      const role = asRole(body.role);
      const result = await engine.join(role);
      lastAction = { kind: 'join', role, result };
      json(res, 200, { message: 'join submitted', result, state: engine.getState(), addresses: engine.getAddresses() });
      return;
    }

    if (req.url === '/api/move') {
      const role = asRole(body.role);
      const result = await engine.playC4(role, Number(body.column || 0));
      lastAction = { kind: 'move', role, mode: 'c4', result };
      json(res, 200, { message: 'move submitted', result, state: engine.getState(), addresses: engine.getAddresses() });
      return;
    }

    if (req.url === '/api/claim-timeout') {
      const role = asRole(body.role);
      const result = await engine.claimTimeout(role);
      lastAction = { kind: 'claim-timeout', role, result };
      json(res, 200, { message: 'timeout claimed', result, state: engine.getState(), addresses: engine.getAddresses() });
      return;
    }

    if (req.url === '/api/resign') {
      const role = asRole(body.role);
      const result = await engine.resign(role);
      lastAction = { kind: 'resign', role, result };
      json(res, 200, { message: 'resigned', result, state: engine.getState(), addresses: engine.getAddresses() });
      return;
    }

    if (req.url === '/api/cancel') {
      const result = await engine.cancel();
      lastAction = { kind: 'cancel', result };
      json(res, 200, { message: 'waiting match cancelled', result, state: engine.getState(), addresses: engine.getAddresses() });
      return;
    }

    json(res, 404, { error: 'unknown endpoint' });
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
}

const port = Number(process.env.PORT || 4178);
createServer(handler).listen(port, '127.0.0.1', () => {
  console.log(`Connect4 GUI server listening on http://127.0.0.1:${port}`);
});
