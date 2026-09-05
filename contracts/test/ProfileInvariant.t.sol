// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import { Test } from "forge-std/Test.sol";
import { StdInvariant } from "forge-std/StdInvariant.sol";
import { CreditPool } from "../src/creditcoin/CreditPool.sol";
import { MockUSD } from "../src/creditcoin/MockUSD.sol";

/// @dev Accounting-only ASC stand-in. Native proof acceptance is tested separately.
contract ProfileHandler is Test {
    CreditPool public pool;
    MockUSD public asset;
    bytes32[] public ids;
    address public constant BORROWER = address(0xB0);
    address public constant PAYER = address(0xC0);

    constructor(CreditPool pool_, MockUSD asset_) {
        pool = pool_;
        asset = asset_;
    }

    function open(uint96 seed) external {
        if (ids.length >= 16) return;
        bytes32 id = keccak256(abi.encode(ids.length));
        uint256 limit = bound(seed, 1, 1000e6);
        pool.openLine(
            id,
            BORROWER,
            limit,
            uint64(block.timestamp + 7 days),
            limit * 2,
            uint64(block.timestamp + 15 days),
            keccak256(abi.encode(id))
        );
        ids.push(id);
    }

    function draw(uint256 seed, uint96 amount) external {
        if (ids.length == 0) return;
        bytes32 id = ids[seed % ids.length];
        (,,, uint64 maturity,,,) = pool.lines(id);
        if (block.timestamp >= maturity) return;
        uint256 available = pool.available(id);
        if (available == 0) return;
        vm.prank(BORROWER);
        pool.borrow(id, bound(amount, 1, available));
    }

    function pay(uint256 seed, uint96 amount, bool thirdParty) external {
        if (ids.length == 0) return;
        bytes32 id = ids[seed % ids.length];
        (,, uint256 debt,,,,) = pool.lines(id);
        address payer = thirdParty ? PAYER : BORROWER;
        uint256 balance = asset.balanceOf(payer);
        if (debt == 0 || balance == 0) return;
        // Includes excess and partial repayments; the pool must cap the actual transfer.
        uint256 requested = bound(amount, 1, balance);
        vm.startPrank(payer);
        asset.approve(address(pool), requested);
        pool.repay(id, requested);
        vm.stopPrank();
    }

    function advance(uint32 elapsed) external {
        vm.warp(block.timestamp + bound(elapsed, 1, 9 days));
    }

    function count() external view returns (uint256) {
        return ids.length;
    }
}

contract ProfileInvariantTest is StdInvariant, Test {
    CreditPool pool;
    MockUSD asset;
    ProfileHandler handler;

    function setUp() public {
        asset = new MockUSD(address(this));
        pool = new CreditPool(address(asset), address(this));
        handler = new ProfileHandler(pool, asset);
        pool.setASC(address(handler));
        asset.mint(address(pool), 1_000_000e6);
        asset.mint(handler.PAYER(), 100_000e6);
        targetContract(address(handler));
    }

    function invariantProfileEqualsAllLinesAndTokenConservation() public view {
        uint256 debtSum;
        uint256 creditSum;
        for (uint256 i; i < handler.count(); ++i) {
            (, uint256 limit, uint256 debt,,,,) = pool.lines(handler.ids(i));
            assertLe(debt, limit);
            debtSum += debt;
            creditSum += limit;
        }
        (uint256 lines, uint256 credit, uint256 borrowed, uint256 repaid, uint256 outstanding) =
            pool.borrowerProfiles(handler.BORROWER());
        assertEq(lines, handler.count());
        assertEq(credit, creditSum);
        assertEq(borrowed - repaid, outstanding);
        assertEq(outstanding, debtSum);
        (uint256 payerLines,,,, uint256 payerDebt) = pool.borrowerProfiles(handler.PAYER());
        assertEq(payerLines, 0);
        assertEq(payerDebt, 0);
        assertEq(
            asset.balanceOf(address(pool)) + asset.balanceOf(handler.BORROWER())
                + asset.balanceOf(handler.PAYER()),
            1_100_000e6
        );
    }
}
