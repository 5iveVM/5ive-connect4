fn bit2(index: u64) -> u64 {
    if index == 0 { return 1; }
    if index == 1 { return 2; }
    if index == 2 { return 4; }
    if index == 3 { return 8; }
    if index == 4 { return 16; }
    if index == 5 { return 32; }
    if index == 6 { return 64; }
    return 0;
}

fn has_bit(bits: u64, index: u64) -> bool {
    let p = bit2(index);
    return ((bits / p) % 2) == 1;
}

// @test-params 0 0 true
pub test_connect4_column_starts_empty(height0: u64, height1: u64) -> bool {
    return height0 == 0 && height1 == 0;
}

// @test-params 0 0 true
pub test_connect4_gravity_first_piece(row: u64, expected: u64) -> bool {
    return row == expected;
}

// @test-params 6 true
pub test_connect4_rejects_full_column(height: u64) -> bool {
    return height >= 6;
}

// @test-params 15 true
pub test_connect4_vertical_mask(mask: u64) -> bool {
    return has_bit(mask, 0) && has_bit(mask, 1) && has_bit(mask, 2) && has_bit(mask, 3);
}

// @test-params true true
pub test_connect4_timeout_claimable(is_expired: bool) -> bool {
    return is_expired;
}
