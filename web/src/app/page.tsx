"use client";

import { useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, type ConfirmOptions } from "@solana/web3.js";
import { FiveProgram, FiveSDK } from "@5ive-tech/sdk";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

type Accounts = { config: string; matchState: string; profile: string; invitedPlayer: string };

type GameState = {
  board: number[];
  heights: number[];
  turn: number;
  winner: number;
  status: string;
  phase: "not_started" | "waiting" | "active" | "finished" | "cancelled";
};

const DEFAULT_VM_PROGRAM_ID = process.env.NEXT_PUBLIC_FIVE_VM_PROGRAM_ID || "5ive5uKDkc3Yhyfu1Sk7i3eVPDQUmG2GmTm2FnUZiTJd";
const DEFAULT_SCRIPT_ACCOUNT = process.env.NEXT_PUBLIC_FIVE_SCRIPT_ACCOUNT || "";
const CONFIRM_OPTS: ConfirmOptions = { commitment: "confirmed", preflightCommitment: "confirmed", skipPreflight: false };

const TURN_P1 = 1;
const TURN_P2 = 2;

function decodeBase64ToBytes(base64: string): Uint8Array {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function c4Index(row: number, col: number) { return row * 7 + col; }

function detectWinner(board: number[]): number {
  for (let r = 0; r < 6; r += 1) for (let c = 0; c < 4; c += 1) {
    const v = board[c4Index(r, c)];
    if (v !== 0 && v === board[c4Index(r, c + 1)] && v === board[c4Index(r, c + 2)] && v === board[c4Index(r, c + 3)]) return v;
  }
  for (let c = 0; c < 7; c += 1) for (let r = 0; r < 3; r += 1) {
    const v = board[c4Index(r, c)];
    if (v !== 0 && v === board[c4Index(r + 1, c)] && v === board[c4Index(r + 2, c)] && v === board[c4Index(r + 3, c)]) return v;
  }
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 4; c += 1) {
    const v = board[c4Index(r, c)];
    if (v !== 0 && v === board[c4Index(r + 1, c + 1)] && v === board[c4Index(r + 2, c + 2)] && v === board[c4Index(r + 3, c + 3)]) return v;
  }
  for (let r = 3; r < 6; r += 1) for (let c = 0; c < 4; c += 1) {
    const v = board[c4Index(r, c)];
    if (v !== 0 && v === board[c4Index(r - 1, c + 1)] && v === board[c4Index(r - 2, c + 2)] && v === board[c4Index(r - 3, c + 3)]) return v;
  }
  return 0;
}

async function loadProgram(scriptAccount: string, vmProgramId: string) {
  const artifactText = await fetch("/main.five", { cache: "no-store" }).then(async (res) => {
    if (!res.ok) throw new Error("Missing /main.five. Run npm run build in 5ive-connect4 first.");
    return res.text();
  });
  const loaded = await FiveSDK.loadFiveFile(artifactText);
  return FiveProgram.fromABI(scriptAccount, loaded.abi, { fiveVMProgramId: vmProgramId });
}

function shortSig(sig: string): string { return sig.length > 14 ? `${sig.slice(0, 6)}...${sig.slice(-6)}` : sig; }
function isWalletRejection(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === "object" && "name" in err && String((err as { name?: unknown }).name).includes("WalletSignTransactionError")) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /rejected|declined|cancel/i.test(msg);
}

function initialGameState(): GameState {
  return {
    board: new Array(42).fill(0),
    heights: new Array(7).fill(0),
    turn: TURN_P1,
    winner: 0,
    status: "Not started",
    phase: "not_started",
  };
}

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [accounts, setAccounts] = useState<Accounts>({ config: "", matchState: "", profile: "", invitedPlayer: "" });
  const [timeoutSecs, setTimeoutSecs] = useState(2);
  const [status, setStatus] = useState("ready");
  const [busy, setBusy] = useState(false);
  const [sigs, setSigs] = useState<string[]>([]);
  const [game, setGame] = useState<GameState>(initialGameState());

  const vmProgramId = useMemo(() => DEFAULT_VM_PROGRAM_ID, []);
  const scriptAccount = useMemo(() => DEFAULT_SCRIPT_ACCOUNT, []);

  const walletConnected = !!wallet.connected && !!wallet.publicKey;
  const pushSig = (sig: string) => setSigs((prev) => [sig, ...prev].slice(0, 6));

  function requireWallet() {
    if (!wallet.publicKey) throw new Error("Connect wallet first.");
    if (!wallet.signTransaction && !wallet.sendTransaction) throw new Error("Wallet does not support transaction signing.");
  }

  async function sendAndConfirm(tx: Transaction, extraSigners: Keypair[] = []) {
    requireWallet();
    tx.feePayer = wallet.publicKey!;
    const latest = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = latest.blockhash;
    if (extraSigners.length > 0) tx.partialSign(...extraSigners);

    let sig = "";
    try {
      if (wallet.signTransaction) {
        const signed = await wallet.signTransaction(tx);
        sig = await connection.sendRawTransaction(signed.serialize(), { ...CONFIRM_OPTS, maxRetries: 3 });
      } else {
        sig = await wallet.sendTransaction!(tx, connection, CONFIRM_OPTS);
      }
    } catch (err) {
      if (isWalletRejection(err)) throw new Error("Transaction canceled in wallet.");
      throw err;
    }

    await connection.confirmTransaction({ signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight }, "confirmed");
    pushSig(sig);
    return sig;
  }

  async function buildFunctionInstruction(functionName: string, accountMap: Record<string, string>, args?: Record<string, unknown>) {
    requireWallet();
    if (!scriptAccount) throw new Error("Set NEXT_PUBLIC_FIVE_SCRIPT_ACCOUNT in web/.env.local");
    const program = await loadProgram(scriptAccount, vmProgramId);

    let builder = program.function(functionName).payer(wallet.publicKey!.toBase58()).accounts(accountMap);
    if (args && Object.keys(args).length > 0) builder = builder.args(args);
    const encoded = await builder.instruction();

    const ix = new TransactionInstruction({
      programId: new PublicKey(encoded.programId),
      keys: encoded.keys.map((k: any) => ({ pubkey: new PublicKey(k.pubkey), isSigner: k.isSigner, isWritable: k.isWritable })),
      data: Buffer.from(decodeBase64ToBytes(encoded.data)),
    });
    return ix;
  }

  async function sendFunction(functionName: string, accountMap: Record<string, string>, args?: Record<string, unknown>) {
    const ix = await buildFunctionInstruction(functionName, accountMap, args);
    return sendAndConfirm(new Transaction().add(ix));
  }

  async function provision() {
    requireWallet();
    const owner = new PublicKey(vmProgramId);
    const config = Keypair.generate();
    const matchState = Keypair.generate();
    const profile = Keypair.generate();
    const lamports = await connection.getMinimumBalanceForRentExemption(2048);

    const tx = new Transaction().add(
      SystemProgram.createAccount({ fromPubkey: wallet.publicKey!, newAccountPubkey: config.publicKey, lamports, space: 512, programId: owner }),
      SystemProgram.createAccount({ fromPubkey: wallet.publicKey!, newAccountPubkey: matchState.publicKey, lamports, space: 2048, programId: owner }),
      SystemProgram.createAccount({ fromPubkey: wallet.publicKey!, newAccountPubkey: profile.publicKey, lamports, space: 512, programId: owner })
    );

    await sendAndConfirm(tx, [config, matchState, profile]);
    setAccounts({ config: config.publicKey.toBase58(), matchState: matchState.publicKey.toBase58(), profile: profile.publicKey.toBase58(), invitedPlayer: "" });
  }

  async function provisionAndInit() {
    requireWallet();
    const owner = new PublicKey(vmProgramId);
    const config = Keypair.generate();
    const matchState = Keypair.generate();
    const profile = Keypair.generate();
    const lamports = await connection.getMinimumBalanceForRentExemption(2048);

    const createConfigIx = SystemProgram.createAccount({
      fromPubkey: wallet.publicKey!,
      newAccountPubkey: config.publicKey,
      lamports,
      space: 512,
      programId: owner,
    });
    const createMatchIx = SystemProgram.createAccount({
      fromPubkey: wallet.publicKey!,
      newAccountPubkey: matchState.publicKey,
      lamports,
      space: 2048,
      programId: owner,
    });
    const createProfileIx = SystemProgram.createAccount({
      fromPubkey: wallet.publicKey!,
      newAccountPubkey: profile.publicKey,
      lamports,
      space: 512,
      programId: owner,
    });

    const initConfigIx = await buildFunctionInstruction(
      "init_connect4_config",
      { config: config.publicKey.toBase58(), authority: wallet.publicKey!.toBase58() },
      { turn_timeout_secs: timeoutSecs, allow_open_matches: 1, allow_invites: 1 }
    );
    const initProfileIx = await buildFunctionInstruction(
      "init_connect4_profile",
      { profile: profile.publicKey.toBase58(), owner: wallet.publicKey!.toBase58() }
    );

    const tx = new Transaction().add(createConfigIx, createMatchIx, createProfileIx, initConfigIx, initProfileIx);
    await sendAndConfirm(tx, [config, matchState, profile]);

    setAccounts({
      config: config.publicKey.toBase58(),
      matchState: matchState.publicKey.toBase58(),
      profile: profile.publicKey.toBase58(),
      invitedPlayer: "",
    });
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setStatus(`${label}...`);
    try {
      await fn();
      setStatus(`${label} ok`);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (/0x1e79|custom program error/i.test(raw)) {
        setStatus(`${label} failed: Match must be active and it must be your turn.`);
      } else if (/Transaction canceled in wallet|User rejected/i.test(raw)) {
        setStatus(`${label} canceled in wallet.`);
      } else {
        setStatus(`${label} failed: ${raw}`);
      }
    } finally {
      setBusy(false);
    }
  }

  const base = {
    config: accounts.config,
    match_state: accounts.matchState,
    profile: accounts.profile,
    authority: wallet.publicKey?.toBase58() || "",
    caller: wallet.publicKey?.toBase58() || "",
    player1: wallet.publicKey?.toBase58() || "",
    player2: wallet.publicKey?.toBase58() || "",
    owner: wallet.publicKey?.toBase58() || "",
    invited_player: accounts.invitedPlayer,
  };

  function tokenClass(value: number) {
    if (value === 1) return "bg-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.55)]";
    if (value === 2) return "bg-rose-500 shadow-[0_0_18px_rgba(244,63,94,0.55)]";
    return "bg-slate-900/70";
  }

  async function playColumn(col: number) {
    if (game.phase !== "active") {
      setStatus("drop blocked: match is not active. Create/Open then Join first.");
      return;
    }
    if (game.winner) {
      setStatus("drop blocked: match already finished.");
      return;
    }
    await run(`drop c${col + 1}`, async () => {
      await sendFunction("play_connect4", { match_state: base.match_state, caller: base.caller }, { column_index: col });
      setGame((prev) => {
        const next = { ...prev, board: [...prev.board], heights: [...prev.heights] };
        const row = next.heights[col];
        if (row >= 6) return next;
        next.heights[col] += 1;
        next.board[c4Index(row, col)] = prev.turn;
        const winner = detectWinner(next.board);
        next.winner = winner;
        if (winner === 1) {
          next.status = "Player 1 wins";
          next.phase = "finished";
        } else if (winner === 2) {
          next.status = "Player 2 wins";
          next.phase = "finished";
        }
        else next.status = "In progress";
        if (!winner) next.turn = prev.turn === TURN_P1 ? TURN_P2 : TURN_P1;
        return next;
      });
    });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 pb-8 pt-28 md:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Connect 4 Arena</h1>
            <p className="text-slate-300">Drop tokens, race to four in a row, settle onchain.</p>
          </div>
          <div className="rounded-full border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm">
            {game.winner ? `Winner: P${game.winner}` : `Turn: P${game.turn}`}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Board</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid grid-cols-7 gap-2">
                {Array.from({ length: 7 }).map((_, c) => (
                  <Button
                    key={`drop-${c}`}
                    variant="secondary"
                    size="sm"
                    disabled={busy || !walletConnected || game.heights[c] >= 6 || !!game.winner}
                    onClick={() => playColumn(c)}
                  >
                    Drop
                  </Button>
                ))}
              </div>

              <div className="rounded-2xl border border-blue-700/60 bg-blue-900/40 p-3">
                <div className="grid grid-cols-7 gap-2">
                  {Array.from({ length: 6 }).map((_, visualRow) => {
                    const row = 5 - visualRow;
                    return Array.from({ length: 7 }).map((_, col) => {
                      const v = game.board[c4Index(row, col)];
                      return (
                        <div key={`${row}-${col}`} className="aspect-square rounded-full border border-slate-700 bg-slate-800 p-1">
                          <div className={`h-full w-full rounded-full transition-all ${tokenClass(v)}`} />
                        </div>
                      );
                    });
                  })}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-4 text-sm text-slate-300">
                <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-amber-400" />Player 1</span>
                <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-rose-500" />Player 2</span>
                <span className="ml-auto">{game.status}</span>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Match Controls</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full" disabled={busy || !walletConnected} onClick={() => run("provision", provision)}>Provision Accounts</Button>
                <Button className="w-full" variant="secondary" disabled={busy || !walletConnected} onClick={() => run("provision + init", provisionAndInit)}>
                  Provision + Init (One TX)
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" disabled={busy || !walletConnected} onClick={() => run("init config", async () => {
                    await sendFunction("init_connect4_config", { config: base.config, authority: base.authority }, { turn_timeout_secs: timeoutSecs, allow_open_matches: 1, allow_invites: 1 });
                  })}>Init Config</Button>
                  <Button variant="outline" disabled={busy || !walletConnected} onClick={() => run("init profile", async () => {
                    await sendFunction("init_connect4_profile", { profile: base.profile, owner: base.owner });
                  })}>Init Profile</Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" disabled={busy || !walletConnected} onClick={() => run("open match", async () => {
                    await sendFunction("create_open_connect4_match", { config: base.config, match_state: base.match_state, player1: base.player1 });
                    setGame({ ...initialGameState(), phase: "waiting", status: "Waiting for player 2 to join" });
                  })}>Open Match</Button>
                  <Button variant="secondary" disabled={busy || !walletConnected || !accounts.invitedPlayer} onClick={() => run("invite match", async () => {
                    await sendFunction("create_invite_connect4_match", { config: base.config, match_state: base.match_state, player1: base.player1, invited_player: base.invited_player });
                    setGame({ ...initialGameState(), phase: "waiting", status: "Invite created. Waiting for join" });
                  })}>Invite Match</Button>
                </div>
                <Button variant="outline" className="w-full" disabled={busy || !walletConnected} onClick={() => run("join", async () => {
                  await sendFunction("join_connect4_match", { config: base.config, match_state: base.match_state, player2: base.player2 });
                  setGame((prev) => ({ ...prev, phase: "active", status: "In progress" }));
                })}>Join Match</Button>

                <div className="grid grid-cols-3 gap-2">
                  <Button variant="ghost" disabled={busy || !walletConnected} onClick={() => run("resign", async () => {
                    await sendFunction("resign_connect4_match", { match_state: base.match_state, caller: base.caller });
                    setGame((prev) => ({ ...prev, phase: "finished", status: "Resigned" }));
                  })}>Resign</Button>
                  <Button variant="ghost" disabled={busy || !walletConnected} onClick={() => run("timeout", async () => {
                    await sendFunction("claim_connect4_timeout", { match_state: base.match_state, caller: base.caller });
                    setGame((prev) => ({ ...prev, phase: "finished", status: "Timeout claimed" }));
                  })}>Timeout</Button>
                  <Button variant="ghost" disabled={busy || !walletConnected} onClick={() => run("cancel", async () => {
                    await sendFunction("cancel_waiting_connect4_match", { match_state: base.match_state, caller: base.caller });
                    setGame((prev) => ({ ...prev, phase: "cancelled", status: "Cancelled" }));
                  })}>Cancel</Button>
                </div>

                <div className="text-xs text-slate-400">Turn timeout (secs)</div>
                <input type="number" min={1} value={timeoutSecs} onChange={(e) => setTimeoutSecs(Number(e.target.value))} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5" />

                <div className="space-y-2 text-xs">
                  <input placeholder="Config account" className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5" value={accounts.config} onChange={(e) => setAccounts((a) => ({ ...a, config: e.target.value }))} />
                  <input placeholder="Match account" className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5" value={accounts.matchState} onChange={(e) => setAccounts((a) => ({ ...a, matchState: e.target.value }))} />
                  <input placeholder="Profile account" className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5" value={accounts.profile} onChange={(e) => setAccounts((a) => ({ ...a, profile: e.target.value }))} />
                  <input placeholder="Invited player pubkey" className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5" value={accounts.invitedPlayer} onChange={(e) => setAccounts((a) => ({ ...a, invitedPlayer: e.target.value }))} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Session</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div><strong>Status:</strong> {status}</div>
                <div><strong>Match phase:</strong> {game.phase}</div>
                <div className="text-xs text-slate-400 break-all">Script: {scriptAccount || "missing NEXT_PUBLIC_FIVE_SCRIPT_ACCOUNT"}</div>
                <div className="text-xs text-slate-400 break-all">VM: {vmProgramId}</div>
                <div className="pt-1 text-xs text-slate-300">Recent signatures</div>
                <ul className="space-y-1 text-xs text-slate-400">
                  {sigs.map((sig) => <li key={sig} className="font-mono break-all">{shortSig(sig)} {sig}</li>)}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
