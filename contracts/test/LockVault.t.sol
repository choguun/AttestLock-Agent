// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";

import { LockVault } from "../src/source/LockVault.sol";
import { MockUSDC } from "../src/source/MockUSDC.sol";

contract LockVaultTest is Test {
    MockUSDC internal token;
    LockVault internal vault;
    address internal borrower = makeAddr("borrower");

    function setUp() external {
        token = new MockUSDC();
        vault = new LockVault(address(token));
        vm.prank(borrower);
        token.faucet();
    }

    function testFaucetCanOnlyBeClaimedOnce() external {
        assertEq(token.decimals(), 6);
        vm.prank(borrower);
        vm.expectRevert(MockUSDC.FaucetAlreadyClaimed.selector);
        token.faucet();
    }

    function testVaultConstructorRejectsZeroToken() external {
        vm.expectRevert(bytes("token=0"));
        new LockVault(address(0));
    }

    function testLockEscrowsAndWithdrawsAfterExpiry() external {
        uint256 amount = 100e6;
        uint64 unlockAt = uint64(block.timestamp + 14 days);

        vm.startPrank(borrower);
        token.approve(address(vault), amount);
        bytes32 lockId = vault.lock(amount, unlockAt);
        vm.stopPrank();

        assertEq(token.balanceOf(address(vault)), amount);
        (address recordedBorrower, uint256 recordedAmount, uint64 recordedUnlockAt, bool withdrawn) =
            vault.positions(lockId);
        assertEq(recordedBorrower, borrower);
        assertEq(recordedAmount, amount);
        assertEq(recordedUnlockAt, unlockAt);
        assertFalse(withdrawn);

        vm.prank(borrower);
        vm.expectRevert(LockVault.LockNotExpired.selector);
        vault.withdraw(lockId);

        vm.warp(unlockAt);
        vm.prank(borrower);
        vault.withdraw(lockId);
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(token.balanceOf(borrower), token.FAUCET_AMOUNT());
    }

    function testRejectsSmallAndShortLocks() external {
        vm.startPrank(borrower);
        token.approve(address(vault), type(uint256).max);

        vm.expectRevert(LockVault.AmountBelowMinimum.selector);
        vault.lock(99e6, uint64(block.timestamp + 14 days));

        vm.expectRevert(LockVault.LockDurationTooShort.selector);
        vault.lock(100e6, uint64(block.timestamp + 14 days - 1));
        vm.stopPrank();
    }

    function testWithdrawalRequiresKnownOwnedExpiredUnspentLock() external {
        vm.expectRevert(LockVault.UnknownLock.selector);
        vault.withdraw(bytes32(uint256(1)));

        uint64 unlockAt = uint64(block.timestamp + 14 days);
        vm.startPrank(borrower);
        token.approve(address(vault), 100e6);
        bytes32 lockId = vault.lock(100e6, unlockAt);
        vm.stopPrank();

        vm.prank(makeAddr("attacker"));
        vm.expectRevert(LockVault.NotBorrower.selector);
        vault.withdraw(lockId);

        vm.warp(unlockAt);
        vm.prank(borrower);
        vault.withdraw(lockId);
        vm.prank(borrower);
        vm.expectRevert(LockVault.AlreadyWithdrawn.selector);
        vault.withdraw(lockId);
    }

    function testFuzzLockAmount(uint96 rawAmount) external {
        uint256 amount = bound(uint256(rawAmount), 100e6, token.FAUCET_AMOUNT());
        uint64 unlockAt = uint64(block.timestamp + 30 days);

        vm.startPrank(borrower);
        token.approve(address(vault), amount);
        bytes32 lockId = vault.lock(amount, unlockAt);
        vm.stopPrank();

        (, uint256 recordedAmount,,) = vault.positions(lockId);
        assertEq(recordedAmount, amount);
        assertEq(token.balanceOf(address(vault)), amount);
    }
}
