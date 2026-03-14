import { readFile, readdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type ConfirmOptions,
} from '@solana/web3.js';
import { FiveProgram, FiveSDK } from '@5ive-tech/sdk';

export type StepResult = {
  name: string;
  signature: string | null;
  computeUnits: number | null;
  ok: boolean;
  err: string | null;
};

export type Role = 'p1' | 'p2' | 'p3';
export type GameMode = 'c4';

export type LocalnetState = {
  config: {
    turnTimeoutSecs: number;
    allowOpenMatches: boolean;
    allowInvites: boolean;
    nonce: number;
  };
  match: {
    mode: number;
    status: number;
    player1: string;
    player2: string;
    invitedPlayer: string;
    invitedRequired: boolean;
    currentTurn: number;
    winner: number;
    lastMoveIndex: number;
    moveCount: number;
    turnDeadlineTs: number;
    createdAtTs: number;
    startedAtTs: number;
    endedAtTs: number;
  };
  board: number[];
  heights: number[];
};

const MODE_C4 = 1;

const MATCH_WAITING = 0;
const MATCH_ACTIVE = 1;
const MATCH_P1_WIN = 2;
const MATCH_P2_WIN = 3;
const MATCH_DRAW = 4;
const MATCH_CANCELLED = 5;

const TURN_P1 = 1;
const TURN_P2 = 2;

const WINNER_NONE = 0;
const WINNER_P1 = 1;
const WINNER_P2 = 2;

const CONFIRM: ConfirmOptions = {
  commitment: 'confirmed',
  preflightCommitment: 'confirmed',
  skipPreflight: false,
};

function parseConsumedUnits(logs: string[] | null | undefined): number | null {
  if (!logs) return null;
  for (const line of logs) {
    const m = line.match(/consumed (\d+) of/);
    if (m) return Number(m[1]);
  }
  return null;
}

async function resolveArtifactPath(projectRoot: string): Promise<string> {
  const buildDir = join(projectRoot, 'build');
  const mainPath = join(buildDir, 'main.five');
  try {
    await readFile(mainPath, 'utf8');
    return mainPath;
  } catch {
    const entries = await readdir(buildDir);
    const firstFive = entries.find((name) => name.endsWith('.five'));
    if (!firstFive) {
      throw new Error(`No .five artifact found in ${buildDir}. Run npm run build from project root.`);
    }
    return join(buildDir, firstFive);
  }
}

async function loadPayer(): Promise<Keypair> {
  const path = process.env.SOLANA_KEYPAIR_PATH || join(homedir(), '.config/solana/id.json');
  const secret = JSON.parse(await readFile(path, 'utf8')) as number[];
  return Keypair.fromSecretKey(new Uint8Array(secret));
}

async function sendIx(
  connection: Connection,
  payer: Keypair,
  encoded: any,
  extraSigners: Keypair[] = [],
  name: string
): Promise<StepResult> {
  const tx = new Transaction().add(
    new TransactionInstruction({
      programId: new PublicKey(encoded.programId),
      keys: encoded.keys.map((k: any) => ({
        pubkey: new PublicKey(k.pubkey),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: Buffer.from(encoded.data, 'base64'),
    })
  );

  try {
    const signature = await connection.sendTransaction(tx, [payer, ...extraSigners], CONFIRM);
    const latest = await connection.getLatestBlockhash('confirmed');
    await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
    const txMeta = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    const metaErr = txMeta?.meta?.err ?? null;
    const cu = txMeta?.meta?.computeUnitsConsumed ?? parseConsumedUnits(txMeta?.meta?.logMessages);
    return {
      name,
      signature,
      computeUnits: cu,
      ok: metaErr == null,
      err: metaErr == null ? null : JSON.stringify(metaErr),
    };
  } catch (err) {
    return {
      name,
      signature: null,
      computeUnits: null,
      ok: false,
      err: err instanceof Error ? err.message : String(err),
    };
  }
}

async function createOwnedAccount(
  connection: Connection,
  payer: Keypair,
  account: Keypair,
  owner: PublicKey,
  space: number
): Promise<StepResult> {
  const lamports = await connection.getMinimumBalanceForRentExemption(space);
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: account.publicKey,
      lamports,
      space,
      programId: owner,
    })
  );

  try {
    const signature = await connection.sendTransaction(tx, [payer, account], CONFIRM);
    const latest = await connection.getLatestBlockhash('confirmed');
    await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
    return {
      name: `setup:create_account:${account.publicKey.toBase58()}`,
      signature,
      computeUnits: null,
      ok: true,
      err: null,
    };
  } catch (err) {
    return {
      name: `setup:create_account:${account.publicKey.toBase58()}`,
      signature: null,
      computeUnits: null,
      ok: false,
      err: err instanceof Error ? err.message : String(err),
    };
  }
}

async function deployScript(connection: Connection, payer: Keypair, loaded: any, fiveVmProgramId: string) {
  let result: any = await FiveSDK.deployToSolana(loaded.bytecode, connection, payer, {
    fiveVMProgramId: fiveVmProgramId,
  });

  if (!result.success) {
    result = await FiveSDK.deployLargeProgramToSolana(loaded.bytecode, connection, payer, {
      fiveVMProgramId: fiveVmProgramId,
    });
  }

  const scriptAccount = result.scriptAccount || result.programId;
  if (!result.success || !scriptAccount) {
    throw new Error(`deploy failed: ${result.error || 'unknown error'}`);
  }

  return {
    scriptAccount,
    signature: result.transactionId || null,
    deploymentCost: result.deploymentCost || null,
  };
}

function c4Index(row: number, col: number): number {
  return row * 7 + col;
}

function detectC4Winner(cells: number[]): number {
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 4; c++) {
      const v = cells[c4Index(r, c)];
      if (v !== 0 && v === cells[c4Index(r, c + 1)] && v === cells[c4Index(r, c + 2)] && v === cells[c4Index(r, c + 3)]) return v;
    }
  }
  for (let c = 0; c < 7; c++) {
    for (let r = 0; r < 3; r++) {
      const v = cells[c4Index(r, c)];
      if (v !== 0 && v === cells[c4Index(r + 1, c)] && v === cells[c4Index(r + 2, c)] && v === cells[c4Index(r + 3, c)]) return v;
    }
  }
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const v = cells[c4Index(r, c)];
      if (v !== 0 && v === cells[c4Index(r + 1, c + 1)] && v === cells[c4Index(r + 2, c + 2)] && v === cells[c4Index(r + 3, c + 3)]) return v;
    }
  }
  for (let r = 3; r < 6; r++) {
    for (let c = 0; c < 4; c++) {
      const v = cells[c4Index(r, c)];
      if (v !== 0 && v === cells[c4Index(r - 1, c + 1)] && v === cells[c4Index(r - 2, c + 2)] && v === cells[c4Index(r - 3, c + 3)]) return v;
    }
  }
  return WINNER_NONE;
}

export class LocalnetConnect4Engine {
  readonly projectRoot: string;
  readonly connection: Connection;
  readonly payer: Keypair;
  readonly player2: Keypair;
  readonly player3: Keypair;
  readonly fiveVmProgramId: string;
  readonly scriptAccount: string;
  readonly program: any;
  readonly configAccount: Keypair;
  readonly matchAccount: Keypair;
  readonly profileP1Account: Keypair;
  readonly profileP2Account: Keypair;
  readonly setupSteps: StepResult[];

  private state: LocalnetState;

  private constructor(args: {
    projectRoot: string;
    connection: Connection;
    payer: Keypair;
    player2: Keypair;
    player3: Keypair;
    fiveVmProgramId: string;
    scriptAccount: string;
    program: any;
    configAccount: Keypair;
    matchAccount: Keypair;
    profileP1Account: Keypair;
    profileP2Account: Keypair;
    setupSteps: StepResult[];
  }) {
    this.projectRoot = args.projectRoot;
    this.connection = args.connection;
    this.payer = args.payer;
    this.player2 = args.player2;
    this.player3 = args.player3;
    this.fiveVmProgramId = args.fiveVmProgramId;
    this.scriptAccount = args.scriptAccount;
    this.program = args.program;
    this.configAccount = args.configAccount;
    this.matchAccount = args.matchAccount;
    this.profileP1Account = args.profileP1Account;
    this.profileP2Account = args.profileP2Account;
    this.setupSteps = args.setupSteps;

    this.state = {
      config: {
        turnTimeoutSecs: 120,
        allowOpenMatches: true,
        allowInvites: true,
        nonce: 0,
      },
      match: {
        mode: MODE_C4,
        status: MATCH_WAITING,
        player1: '',
        player2: '',
        invitedPlayer: '',
        invitedRequired: false,
        currentTurn: TURN_P1,
        winner: WINNER_NONE,
        lastMoveIndex: 0,
        moveCount: 0,
        turnDeadlineTs: 0,
        createdAtTs: 0,
        startedAtTs: 0,
        endedAtTs: 0,
      },
      board: new Array(42).fill(0),
      heights: [0, 0, 0, 0, 0, 0, 0],
    };
  }

  static async create(projectRoot: string): Promise<LocalnetConnect4Engine> {
    const artifactPath = await resolveArtifactPath(projectRoot);
    const artifactText = await readFile(artifactPath, 'utf8');
    const loaded = await FiveSDK.loadFiveFile(artifactText);

    const rpcUrl = process.env.FIVE_RPC_URL || 'http://127.0.0.1:8899';
    const fiveVmProgramId = process.env.FIVE_VM_PROGRAM_ID || '5ive58PJUPaTyAe7tvU1bvBi25o7oieLLTRsJDoQNJst';

    const connection = new Connection(rpcUrl, 'confirmed');
    const payer = await loadPayer();
    const player2 = Keypair.generate();
    const player3 = Keypair.generate();

    const vmProgramPk = new PublicKey(fiveVmProgramId);
    const vmProgramInfo = await connection.getAccountInfo(vmProgramPk, 'confirmed');
    if (!vmProgramInfo) {
      throw new Error(
        `Five VM program ${fiveVmProgramId} is not deployed on ${rpcUrl}. ` +
          `Deploy/start Five VM on localnet or set FIVE_VM_PROGRAM_ID to a valid deployed program.`
      );
    }

    const existingScript = process.env.FIVE_SCRIPT_ACCOUNT || '';
    const deploy = existingScript
      ? { scriptAccount: existingScript }
      : await deployScript(connection, payer, loaded, fiveVmProgramId);

    const program = FiveProgram.fromABI(deploy.scriptAccount, loaded.abi, {
      fiveVMProgramId: fiveVmProgramId,
    });

    const ownerProgram = vmProgramPk;
    const configAccount = Keypair.generate();
    const matchAccount = Keypair.generate();
    const profileP1Account = Keypair.generate();
    const profileP2Account = Keypair.generate();

    const setupSteps: StepResult[] = [];
    setupSteps.push(await createOwnedAccount(connection, payer, configAccount, ownerProgram, 256));
    setupSteps.push(await createOwnedAccount(connection, payer, matchAccount, ownerProgram, 2048));
    setupSteps.push(await createOwnedAccount(connection, payer, profileP1Account, ownerProgram, 256));
    setupSteps.push(await createOwnedAccount(connection, payer, profileP2Account, ownerProgram, 256));

    for (const wallet of [player2, player3]) {
      const sig = await connection.requestAirdrop(wallet.publicKey, 500_000_000);
      const latest = await connection.getLatestBlockhash('confirmed');
      await connection.confirmTransaction({ signature: sig, ...latest }, 'confirmed');
    }

    const failed = setupSteps.find((s) => !s.ok);
    if (failed) {
      throw new Error(`failed setup account creation: ${failed.name}: ${failed.err || 'unknown error'}`);
    }

    return new LocalnetConnect4Engine({
      projectRoot,
      connection,
      payer,
      player2,
      player3,
      fiveVmProgramId,
      scriptAccount: deploy.scriptAccount,
      program,
      configAccount,
      matchAccount,
      profileP1Account,
      profileP2Account,
      setupSteps,
    });
  }

  getState(): LocalnetState {
    return JSON.parse(JSON.stringify(this.state)) as LocalnetState;
  }

  getAddresses() {
    return {
      payer: this.payer.publicKey.toBase58(),
      p1: this.payer.publicKey.toBase58(),
      p2: this.player2.publicKey.toBase58(),
      p3: this.player3.publicKey.toBase58(),
      scriptAccount: this.scriptAccount,
      fiveVmProgramId: this.fiveVmProgramId,
      config: this.configAccount.publicKey.toBase58(),
      match: this.matchAccount.publicKey.toBase58(),
      profileP1: this.profileP1Account.publicKey.toBase58(),
      profileP2: this.profileP2Account.publicKey.toBase58(),
    };
  }

  private keypairForRole(role: Role): Keypair {
    if (role === 'p1') return this.payer;
    if (role === 'p2') return this.player2;
    return this.player3;
  }

  private rolePubkey(role: Role): string {
    return this.keypairForRole(role).publicKey.toBase58();
  }

  private accountsFor(functionName: string, role: Role): Record<string, string> {
    const p1 = this.payer.publicKey.toBase58();
    const p2 = this.player2.publicKey.toBase58();
    const roleKey = this.rolePubkey(role);

    if (functionName === 'init_config') return { config: this.configAccount.publicKey.toBase58(), authority: p1 };
    if (functionName === 'init_profile') {
      if (role === 'p1') return { profile: this.profileP1Account.publicKey.toBase58(), owner: p1 };
      return { profile: this.profileP2Account.publicKey.toBase58(), owner: p2 };
    }
    if (functionName === 'create_open_match') {
      return { config: this.configAccount.publicKey.toBase58(), match_state: this.matchAccount.publicKey.toBase58(), player1: p1 };
    }
    if (functionName === 'create_invite_match') {
      return {
        config: this.configAccount.publicKey.toBase58(),
        match_state: this.matchAccount.publicKey.toBase58(),
        player1: p1,
        invited_player: p2,
      };
    }
    if (functionName === 'join_match') {
      return { config: this.configAccount.publicKey.toBase58(), match_state: this.matchAccount.publicKey.toBase58(), player2: roleKey };
    }
    if (functionName === 'play_c4' || functionName === 'claim_timeout' || functionName === 'resign' || functionName === 'cancel_waiting_match') {
      return { match_state: this.matchAccount.publicKey.toBase58(), caller: roleKey };
    }
    if (functionName === 'get_match_status' || functionName === 'get_match_turn' || functionName === 'get_match_winner') {
      return { match_state: this.matchAccount.publicKey.toBase58() };
    }
    return {};
  }

  private async call(functionName: string, role: Role, args: Record<string, any> = {}): Promise<StepResult> {
    const actor = this.keypairForRole(role);
    let builder = this.program
      .function(functionName)
      .payer(this.payer.publicKey.toBase58())
      .accounts(this.accountsFor(functionName, role));

    if (Object.keys(args).length > 0) {
      builder = builder.args(args);
    }

    const ix = await builder.instruction();
    const signers = actor.publicKey.equals(this.payer.publicKey) ? [] : [actor];
    return sendIx(this.connection, this.payer, ix, signers, `${functionName}:${role}`);
  }

  async initGame(turnTimeoutSecs = 120): Promise<StepResult[]> {
    const steps: StepResult[] = [];

    steps.push(
      await this.call('init_config', 'p1', {
        turn_timeout_secs: turnTimeoutSecs,
        allow_open_matches: 1,
        allow_invites: 1,
      })
    );
    steps.push(await this.call('init_profile', 'p1', {}));
    steps.push(await this.call('init_profile', 'p2', {}));

    if (steps.every((s) => s.ok)) {
      this.state.config.turnTimeoutSecs = turnTimeoutSecs;
      this.state.config.allowOpenMatches = true;
      this.state.config.allowInvites = true;
      this.state.config.nonce = 0;
    }

    return steps;
  }

  private async nowSlot(): Promise<number> {
    return Number(await this.connection.getSlot('confirmed'));
  }

  private resetBoard() {
    this.state.board = new Array(42).fill(0);
    this.state.heights = [0, 0, 0, 0, 0, 0, 0];
  }

  async createOpen(_mode: GameMode): Promise<StepResult> {
    const step = await this.call('create_open_match', 'p1', { mode: MODE_C4 });
    if (!step.ok) return step;

    this.state.config.nonce += 1;
    const now = await this.nowSlot();
    this.resetBoard();

    this.state.match.mode = MODE_C4;
    this.state.match.status = MATCH_WAITING;
    this.state.match.player1 = this.rolePubkey('p1');
    this.state.match.player2 = this.rolePubkey('p1');
    this.state.match.invitedPlayer = this.rolePubkey('p1');
    this.state.match.invitedRequired = false;
    this.state.match.currentTurn = TURN_P1;
    this.state.match.winner = WINNER_NONE;
    this.state.match.lastMoveIndex = 0;
    this.state.match.moveCount = 0;
    this.state.match.createdAtTs = now;
    this.state.match.startedAtTs = 0;
    this.state.match.turnDeadlineTs = 0;
    this.state.match.endedAtTs = 0;

    return step;
  }

  async createInvite(_mode: GameMode): Promise<StepResult> {
    const step = await this.call('create_invite_match', 'p1', { mode: MODE_C4 });
    if (!step.ok) return step;

    this.state.config.nonce += 1;
    const now = await this.nowSlot();
    this.resetBoard();

    this.state.match.mode = MODE_C4;
    this.state.match.status = MATCH_WAITING;
    this.state.match.player1 = this.rolePubkey('p1');
    this.state.match.player2 = this.rolePubkey('p1');
    this.state.match.invitedPlayer = this.rolePubkey('p2');
    this.state.match.invitedRequired = true;
    this.state.match.currentTurn = TURN_P1;
    this.state.match.winner = WINNER_NONE;
    this.state.match.lastMoveIndex = 0;
    this.state.match.moveCount = 0;
    this.state.match.createdAtTs = now;
    this.state.match.startedAtTs = 0;
    this.state.match.turnDeadlineTs = 0;
    this.state.match.endedAtTs = 0;

    return step;
  }

  async join(role: Role = 'p2'): Promise<StepResult> {
    const step = await this.call('join_match', role, {});
    if (!step.ok) return step;

    const now = await this.nowSlot();
    this.state.match.player2 = this.rolePubkey(role);
    this.state.match.status = MATCH_ACTIVE;
    this.state.match.currentTurn = TURN_P1;
    this.state.match.startedAtTs = now;
    this.state.match.turnDeadlineTs = now + this.state.config.turnTimeoutSecs;

    return step;
  }

  async playC4(role: Role, column: number): Promise<StepResult> {
    const step = await this.call('play_c4', role, { column_index: column });
    if (!step.ok) return step;

    const row = this.state.heights[column];
    this.state.heights[column] += 1;

    const seat = role === 'p1' ? WINNER_P1 : WINNER_P2;
    const idx = c4Index(row, column);
    this.state.board[idx] = seat;
    this.state.match.lastMoveIndex = idx;
    this.state.match.moveCount += 1;

    const winner = detectC4Winner(this.state.board);
    const now = await this.nowSlot();
    if (winner === WINNER_P1) {
      this.state.match.status = MATCH_P1_WIN;
      this.state.match.winner = WINNER_P1;
      this.state.match.endedAtTs = now;
      return step;
    }
    if (winner === WINNER_P2) {
      this.state.match.status = MATCH_P2_WIN;
      this.state.match.winner = WINNER_P2;
      this.state.match.endedAtTs = now;
      return step;
    }
    if (this.state.match.moveCount >= 42) {
      this.state.match.status = MATCH_DRAW;
      this.state.match.winner = WINNER_NONE;
      this.state.match.endedAtTs = now;
      return step;
    }

    this.state.match.currentTurn = this.state.match.currentTurn === TURN_P1 ? TURN_P2 : TURN_P1;
    this.state.match.turnDeadlineTs = now + this.state.config.turnTimeoutSecs;
    return step;
  }

  async claimTimeout(role: Role): Promise<StepResult> {
    const step = await this.call('claim_timeout', role, {});
    if (!step.ok) return step;

    const now = await this.nowSlot();
    const winner = role === 'p1' ? WINNER_P1 : WINNER_P2;
    this.state.match.winner = winner;
    this.state.match.status = winner === WINNER_P1 ? MATCH_P1_WIN : MATCH_P2_WIN;
    this.state.match.endedAtTs = now;
    return step;
  }

  async resign(role: Role): Promise<StepResult> {
    const step = await this.call('resign', role, {});
    if (!step.ok) return step;

    const now = await this.nowSlot();
    const winner = role === 'p1' ? WINNER_P2 : WINNER_P1;
    this.state.match.winner = winner;
    this.state.match.status = winner === WINNER_P1 ? MATCH_P1_WIN : MATCH_P2_WIN;
    this.state.match.endedAtTs = now;
    return step;
  }

  async cancel(): Promise<StepResult> {
    const step = await this.call('cancel_waiting_match', 'p1', {});
    if (!step.ok) return step;

    this.state.match.status = MATCH_CANCELLED;
    this.state.match.winner = WINNER_NONE;
    this.state.match.endedAtTs = await this.nowSlot();
    return step;
  }

  async waitForTimeoutWindow(): Promise<void> {
    const target = this.state.match.turnDeadlineTs + 1;
    let now = await this.nowSlot();
    while (now < target) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      now = await this.nowSlot();
    }
  }

  async readOnchainSummary(): Promise<{ status: StepResult; turn: StepResult; winner: StepResult }> {
    const status = await this.call('get_match_status', 'p1', {});
    const turn = await this.call('get_match_turn', 'p1', {});
    const winner = await this.call('get_match_winner', 'p1', {});
    return { status, turn, winner };
  }
}

export const constants = {
  MODE_C4,
  MATCH_WAITING,
  MATCH_ACTIVE,
  MATCH_P1_WIN,
  MATCH_P2_WIN,
  MATCH_DRAW,
  MATCH_CANCELLED,
  TURN_P1,
  TURN_P2,
  WINNER_NONE,
  WINNER_P1,
  WINNER_P2,
};
