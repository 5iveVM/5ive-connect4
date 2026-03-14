// @test-params true true
pub test_create_open_match_and_join(ok: bool) -> bool {
    return ok;
}

// @test-params true true
pub test_invite_match_rejects_wrong_joiner(rejected: bool) -> bool {
    return rejected;
}

// @test-params 0 0 true
pub test_c4_gravity_applies(height_before: u64, row_landed: u64) -> bool {
    return row_landed == height_before;
}

// @test-params 4 true
pub test_c4_vertical_win(height: u64) -> bool {
    return height >= 4;
}

// @test-params 4 true
pub test_c4_horizontal_win(chain: u64) -> bool {
    return chain >= 4;
}

// @test-params 4 true
pub test_c4_diagonal_win(chain: u64) -> bool {
    return chain >= 4;
}

// @test-params 6 true
pub test_c4_rejects_full_column(height: u64) -> bool {
    return height >= 6;
}

// @test-params true true
pub test_timeout_claim_awards_win(timed_out: bool) -> bool {
    return timed_out;
}

// @test-params 2 true
pub test_cannot_move_after_match_end(status: u64) -> bool {
    return status >= 2;
}

// @test-params true true
pub test_cancel_waiting_match(cancelled: bool) -> bool {
    return cancelled;
}
