account Connect4Config {
    authority: pubkey;
    turn_timeout_secs: u64;
    allow_open_matches: u64;
    allow_invites: u64;
    match_nonce: u64;
}

account MatchState {
    mode: u64;
    status: u64;
    player1: pubkey;
    player2: pubkey;
    invited_player: pubkey;
    invited_required: bool;
    current_turn: u64;
    winner: u64;
    last_move_index: u64;
    move_count: u64;
    turn_timeout_secs: u64;
    turn_deadline_ts: u64;
    created_at_ts: u64;
    started_at_ts: u64;
    ended_at_ts: u64;
    c4_p1_bits: u64;
    c4_p2_bits: u64;
    c4_h0: u64;
    c4_h1: u64;
    c4_h2: u64;
    c4_h3: u64;
    c4_h4: u64;
    c4_h5: u64;
    c4_h6: u64;
}

account PlayerProfile {
    authority: pubkey;
    games_played: u64;
    wins: u64;
    losses: u64;
    draws: u64;
    timeouts_claimed: u64;
}

fn mode_c4() -> u64 { return 1; }

fn match_waiting() -> u64 { return 0; }
fn match_active() -> u64 { return 1; }
fn match_p1_win() -> u64 { return 2; }
fn match_p2_win() -> u64 { return 3; }
fn match_draw() -> u64 { return 4; }
fn match_cancelled() -> u64 { return 5; }

fn turn_p1() -> u64 { return 1; }
fn turn_p2() -> u64 { return 2; }

fn winner_none() -> u64 { return 0; }
fn winner_p1() -> u64 { return 1; }
fn winner_p2() -> u64 { return 2; }

fn now_slot() -> u64 {
    return get_clock().slot;
}

fn pow2(index: u64) -> u64 {
    let mut p = 1;
    let mut i = 0;
    while (i < index) {
        p = p * 2;
        i = i + 1;
    }
    return p;
}

fn has_bit(bits: u64, index: u64) -> bool {
    let p = pow2(index);
    return ((bits / p) % 2) == 1;
}

fn set_bit(bits: u64, index: u64) -> u64 {
    require(!has_bit(bits, index));
    return bits + pow2(index);
}

fn seat_of(match_state: MatchState, key: pubkey) -> u64 {
    if match_state.player1 == key {
        return turn_p1();
    }
    if match_state.player2 == key {
        return turn_p2();
    }
    return winner_none();
}

fn c4_height_for(match_state: MatchState, column: u64) -> u64 {
    if column == 0 { return match_state.c4_h0; }
    if column == 1 { return match_state.c4_h1; }
    if column == 2 { return match_state.c4_h2; }
    if column == 3 { return match_state.c4_h3; }
    if column == 4 { return match_state.c4_h4; }
    if column == 5 { return match_state.c4_h5; }
    return match_state.c4_h6;
}

fn c4_set_height(match_state: MatchState @mut, column: u64, value: u64) {
    if column == 0 { match_state.c4_h0 = value; }
    if column == 1 { match_state.c4_h1 = value; }
    if column == 2 { match_state.c4_h2 = value; }
    if column == 3 { match_state.c4_h3 = value; }
    if column == 4 { match_state.c4_h4 = value; }
    if column == 5 { match_state.c4_h5 = value; }
    if column == 6 { match_state.c4_h6 = value; }
}

fn c4_is_owner_cell(match_state: MatchState, row: u64, col: u64, owner: u64) -> bool {
    let idx = (row * 7) + col;
    if owner == winner_p1() {
        return has_bit(match_state.c4_p1_bits, idx);
    }
    if owner == winner_p2() {
        return has_bit(match_state.c4_p2_bits, idx);
    }
    return false;
}

fn c4_has_connect4_from_last(match_state: MatchState, row: u64, col: u64, owner: u64) -> bool {
    let mut count = 1;
    let mut i = 0;
    let mut r = row;
    let mut c = col;
    let mut active = true;

    i = 0;
    r = row;
    c = col;
    active = true;
    while (i < 3) {
        if active {
            if c == 0 {
                active = false;
            } else {
                c = c - 1;
                if c4_is_owner_cell(match_state, r, c, owner) {
                    count = count + 1;
                } else {
                    active = false;
                }
            }
        }
        i = i + 1;
    }
    i = 0;
    r = row;
    c = col;
    active = true;
    while (i < 3) {
        if active {
            if c >= 6 {
                active = false;
            } else {
                c = c + 1;
                if c4_is_owner_cell(match_state, r, c, owner) {
                    count = count + 1;
                } else {
                    active = false;
                }
            }
        }
        i = i + 1;
    }
    if count >= 4 {
        return true;
    }

    count = 1;
    i = 0;
    r = row;
    c = col;
    active = true;
    while (i < 3) {
        if active {
            if r == 0 {
                active = false;
            } else {
                r = r - 1;
                if c4_is_owner_cell(match_state, r, c, owner) {
                    count = count + 1;
                } else {
                    active = false;
                }
            }
        }
        i = i + 1;
    }
    if count >= 4 {
        return true;
    }

    count = 1;
    i = 0;
    r = row;
    c = col;
    active = true;
    while (i < 3) {
        if active {
            if r == 0 || c == 0 {
                active = false;
            } else {
                r = r - 1;
                c = c - 1;
                if c4_is_owner_cell(match_state, r, c, owner) {
                    count = count + 1;
                } else {
                    active = false;
                }
            }
        }
        i = i + 1;
    }
    i = 0;
    r = row;
    c = col;
    active = true;
    while (i < 3) {
        if active {
            if r >= 5 || c >= 6 {
                active = false;
            } else {
                r = r + 1;
                c = c + 1;
                if c4_is_owner_cell(match_state, r, c, owner) {
                    count = count + 1;
                } else {
                    active = false;
                }
            }
        }
        i = i + 1;
    }
    if count >= 4 {
        return true;
    }

    count = 1;
    i = 0;
    r = row;
    c = col;
    active = true;
    while (i < 3) {
        if active {
            if r == 0 || c >= 6 {
                active = false;
            } else {
                r = r - 1;
                c = c + 1;
                if c4_is_owner_cell(match_state, r, c, owner) {
                    count = count + 1;
                } else {
                    active = false;
                }
            }
        }
        i = i + 1;
    }
    i = 0;
    r = row;
    c = col;
    active = true;
    while (i < 3) {
        if active {
            if r >= 5 || c == 0 {
                active = false;
            } else {
                r = r + 1;
                c = c - 1;
                if c4_is_owner_cell(match_state, r, c, owner) {
                    count = count + 1;
                } else {
                    active = false;
                }
            }
        }
        i = i + 1;
    }

    return count >= 4;
}

fn mark_win(match_state: MatchState @mut, winning_player: u64, current_time: u64) {
    match_state.winner = winning_player;
    if winning_player == winner_p1() {
        match_state.status = match_p1_win();
    }
    if winning_player == winner_p2() {
        match_state.status = match_p2_win();
    }
    match_state.ended_at_ts = current_time;
}

fn mark_draw(match_state: MatchState @mut, current_time: u64) {
    match_state.winner = winner_none();
    match_state.status = match_draw();
    match_state.ended_at_ts = current_time;
}

pub init_config(
    config: Connect4Config @mut,
    authority: account @signer,
    turn_timeout_secs: u64,
    allow_open_matches: u64,
    allow_invites: u64
) {
    require(turn_timeout_secs > 0);
    require(allow_open_matches <= 1);
    require(allow_invites <= 1);

    config.authority = authority.ctx.key;
    config.turn_timeout_secs = turn_timeout_secs;
    config.allow_open_matches = allow_open_matches;
    config.allow_invites = allow_invites;
    config.match_nonce = 0;
}

pub init_profile(
    profile: PlayerProfile @mut,
    owner: account @signer
) {
    profile.authority = owner.ctx.key;
    profile.games_played = 0;
    profile.wins = 0;
    profile.losses = 0;
    profile.draws = 0;
    profile.timeouts_claimed = 0;
}

pub create_open_match(
    config: Connect4Config @mut,
    match_state: MatchState @mut,
    player1: account @signer,
    mode: u64
) {
    require(config.allow_open_matches == 1);
    require(mode == mode_c4());

    config.match_nonce = config.match_nonce + 1;

    match_state.mode = mode;
    match_state.status = match_waiting();
    match_state.player1 = player1.ctx.key;
    match_state.player2 = player1.ctx.key;
    match_state.invited_player = player1.ctx.key;
    match_state.invited_required = false;
    match_state.current_turn = turn_p1();
    match_state.winner = winner_none();
    match_state.last_move_index = 0;
    match_state.move_count = 0;
    match_state.turn_timeout_secs = config.turn_timeout_secs;
    match_state.turn_deadline_ts = 0;
    match_state.created_at_ts = now_slot();
    match_state.started_at_ts = 0;
    match_state.ended_at_ts = 0;
    match_state.c4_p1_bits = 0;
    match_state.c4_p2_bits = 0;
    match_state.c4_h0 = 0;
    match_state.c4_h1 = 0;
    match_state.c4_h2 = 0;
    match_state.c4_h3 = 0;
    match_state.c4_h4 = 0;
    match_state.c4_h5 = 0;
    match_state.c4_h6 = 0;
}

pub create_invite_match(
    config: Connect4Config @mut,
    match_state: MatchState @mut,
    player1: account @signer,
    invited_player: account,
    mode: u64
) {
    require(config.allow_invites == 1);
    require(mode == mode_c4());
    require(player1.ctx.key != invited_player.ctx.key);

    config.match_nonce = config.match_nonce + 1;

    match_state.mode = mode;
    match_state.status = match_waiting();
    match_state.player1 = player1.ctx.key;
    match_state.player2 = player1.ctx.key;
    match_state.invited_player = invited_player.ctx.key;
    match_state.invited_required = true;
    match_state.current_turn = turn_p1();
    match_state.winner = winner_none();
    match_state.last_move_index = 0;
    match_state.move_count = 0;
    match_state.turn_timeout_secs = config.turn_timeout_secs;
    match_state.turn_deadline_ts = 0;
    match_state.created_at_ts = now_slot();
    match_state.started_at_ts = 0;
    match_state.ended_at_ts = 0;
    match_state.c4_p1_bits = 0;
    match_state.c4_p2_bits = 0;
    match_state.c4_h0 = 0;
    match_state.c4_h1 = 0;
    match_state.c4_h2 = 0;
    match_state.c4_h3 = 0;
    match_state.c4_h4 = 0;
    match_state.c4_h5 = 0;
    match_state.c4_h6 = 0;
}

pub join_match(
    config: Connect4Config,
    match_state: MatchState @mut,
    player2: account @signer
) {
    require(config.turn_timeout_secs > 0);
    require(match_state.status == match_waiting());
    require(match_state.player1 != player2.ctx.key);

    if match_state.invited_required {
        require(match_state.invited_player == player2.ctx.key);
    }

    match_state.player2 = player2.ctx.key;
    match_state.status = match_active();
    match_state.current_turn = turn_p1();

    let now = now_slot();
    match_state.started_at_ts = now;
    match_state.turn_deadline_ts = now + match_state.turn_timeout_secs;
}

pub play_c4(
    match_state: MatchState @mut,
    caller: account @signer,
    column_index: u64
) {
    require(match_state.mode == mode_c4());
    require(match_state.status == match_active());
    require(column_index < 7);

    let seat = seat_of(match_state, caller.ctx.key);
    require(seat == turn_p1() || seat == turn_p2());
    require(seat == match_state.current_turn);

    let row = c4_height_for(match_state, column_index);
    require(row < 6);
    c4_set_height(match_state, column_index, row + 1);

    let board_index = (row * 7) + column_index;

    if seat == turn_p1() {
        match_state.c4_p1_bits = set_bit(match_state.c4_p1_bits, board_index);
        match_state.current_turn = turn_p2();
    }
    if seat == turn_p2() {
        match_state.c4_p2_bits = set_bit(match_state.c4_p2_bits, board_index);
        match_state.current_turn = turn_p1();
    }

    match_state.move_count = match_state.move_count + 1;
    match_state.last_move_index = board_index;

    let now = now_slot();
    if match_state.move_count >= 7 {
        if seat == turn_p1() {
            if c4_has_connect4_from_last(match_state, row, column_index, winner_p1()) {
                mark_win(match_state, winner_p1(), now);
                return;
            }
        }
        if seat == turn_p2() {
            if c4_has_connect4_from_last(match_state, row, column_index, winner_p2()) {
                mark_win(match_state, winner_p2(), now);
                return;
            }
        }
    }

    if match_state.move_count >= 42 {
        mark_draw(match_state, now);
        return;
    }

    match_state.turn_deadline_ts = now + match_state.turn_timeout_secs;
}

pub claim_timeout(
    match_state: MatchState @mut,
    caller: account @signer
) {
    require(match_state.status == match_active());

    let now = now_slot();
    require(now > match_state.turn_deadline_ts);

    let seat = seat_of(match_state, caller.ctx.key);
    require(seat == turn_p1() || seat == turn_p2());
    require(seat != match_state.current_turn);

    if seat == turn_p1() {
        mark_win(match_state, winner_p1(), now);
    }
    if seat == turn_p2() {
        mark_win(match_state, winner_p2(), now);
    }
}

pub resign(
    match_state: MatchState @mut,
    caller: account @signer
) {
    require(match_state.status == match_active());

    let seat = seat_of(match_state, caller.ctx.key);
    require(seat == turn_p1() || seat == turn_p2());

    let now = now_slot();
    if seat == turn_p1() {
        mark_win(match_state, winner_p2(), now);
    }
    if seat == turn_p2() {
        mark_win(match_state, winner_p1(), now);
    }
}

pub cancel_waiting_match(
    match_state: MatchState @mut,
    caller: account @signer
) {
    require(match_state.status == match_waiting());
    require(match_state.player1 == caller.ctx.key);

    match_state.status = match_cancelled();
    match_state.winner = winner_none();
    match_state.ended_at_ts = now_slot();
}

pub get_match_status(match_state: MatchState) -> u64 {
    return match_state.status;
}

pub get_match_turn(match_state: MatchState) -> u64 {
    return match_state.current_turn;
}

pub get_match_winner(match_state: MatchState) -> u64 {
    return match_state.winner;
}
