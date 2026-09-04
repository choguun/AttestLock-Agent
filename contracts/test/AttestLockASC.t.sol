// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";

import { EvmV1Decoder } from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {
    INativeQueryVerifier
} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";

import { AttestLockASC } from "../src/creditcoin/AttestLockASC.sol";
import { CreditPool } from "../src/creditcoin/CreditPool.sol";
import { MockUSD } from "../src/creditcoin/MockUSD.sol";

contract AttestLockASCTest is Test {
    address internal constant PRECOMPILE = 0x0000000000000000000000000000000000000FD2;
    address internal sourceVault = makeAddr("sourceVault");
    address internal sourceToken = makeAddr("sourceToken");
    address internal borrower = makeAddr("borrower");

    MockUSD internal asset;
    CreditPool internal pool;
    AttestLockASC internal asc;

    bytes32 internal lockId = keccak256("lock-1");
    bytes32 internal merkleRoot = keccak256("merkle-root");
    bytes32 internal lowerDigest = keccak256("lower-digest");
    uint64 internal blockHeight = 7_777;

    function setUp() external {
        asset = new MockUSD(address(this));
        pool = new CreditPool(address(asset), address(this));
        asc = new AttestLockASC(address(pool), sourceVault, sourceToken);
        pool.setASC(address(asc));
        asset.mint(address(pool), 1_000_000e6);
    }

    function testValidProofOpensExactFiftyPercentLine() external {
        uint256 collateral = 200e6;
        uint64 unlockAt = uint64(block.timestamp + 14 days);
        bytes memory encodedTx = _encodedLockTx(1, sourceVault, sourceToken, collateral, unlockAt, lockId);

        _mockVerifier(encodedTx, true, 0);
        _execute(encodedTx, 1);

        (
            address recordedBorrower,
            uint256 limit,
            uint256 debt,
            uint64 maturity,
            uint256 recordedCollateral,
            uint64 recordedUnlockAt,
            bytes32 queryId
        ) = pool.lines(lockId);
        assertEq(recordedBorrower, borrower);
        assertEq(limit, 100e6);
        assertEq(debt, 0);
        assertEq(maturity, block.timestamp + 7 days);
        assertEq(recordedCollateral, collateral);
        assertEq(recordedUnlockAt, unlockAt);
        assertTrue(queryId != bytes32(0));
        assertTrue(asc.usedLocks(lockId));
        assertTrue(asc.processedQueries(queryId));
        (uint256 lineCount, uint256 creditOpened, uint256 borrowed, uint256 repaid, uint256 outstanding) =
            pool.borrowerProfiles(borrower);
        assertEq(lineCount, 1);
        assertEq(creditOpened, 100e6);
        assertEq(borrowed, 0);
        assertEq(repaid, 0);
        assertEq(outstanding, 0);
    }

    function testQueryIdPackingMatchesOfficialASCBaseLayout() external {
        bytes memory encodedTx = _validEncodedTx();
        _mockVerifier(encodedTx, true, 7);
        _execute(encodedTx, 1);
        (,,,,,, bytes32 queryId) = pool.lines(lockId);
        assertEq(queryId, keccak256(abi.encodePacked(uint256(1), blockHeight, uint256(7))));
    }

    function testInvalidProofLeavesStateUnchanged() external {
        bytes memory encodedTx = _validEncodedTx();
        _mockVerifier(encodedTx, false, 0);

        vm.expectRevert(AttestLockASC.ProofVerificationFailed.selector);
        _execute(encodedTx, 1);
        (address recordedBorrower,,,,,,) = pool.lines(lockId);
        assertEq(recordedBorrower, address(0));
        assertFalse(asc.usedLocks(lockId));
        (uint256 lineCount, uint256 creditOpened,,,) = pool.borrowerProfiles(borrower);
        assertEq(lineCount, 0);
        assertEq(creditOpened, 0);
    }

    function testRejectsFailedReceipt() external {
        bytes memory encodedTx =
            _encodedLockTx(0, sourceVault, sourceToken, 200e6, uint64(block.timestamp + 14 days), lockId);
        _mockVerifier(encodedTx, true, 0);
        vm.expectRevert(AttestLockASC.SourceTransactionFailed.selector);
        _execute(encodedTx, 1);
    }

    function testRejectsWrongChainBeforeCallingVerifier() external {
        bytes memory encodedTx = _validEncodedTx();
        vm.expectRevert(AttestLockASC.UnsupportedChain.selector);
        _execute(encodedTx, 3);
    }

    function testRejectsWrongVaultAndWrongToken() external {
        bytes memory wrongVault = _encodedLockTx(
            1, makeAddr("fakeVault"), sourceToken, 200e6, uint64(block.timestamp + 14 days), lockId
        );
        _mockVerifier(wrongVault, true, 0);
        vm.expectRevert(AttestLockASC.MissingLockEvent.selector);
        _execute(wrongVault, 1);

        vm.clearMockedCalls();
        bytes memory wrongToken = _encodedLockTx(
            1, sourceVault, makeAddr("fakeToken"), 200e6, uint64(block.timestamp + 14 days), lockId
        );
        _mockVerifier(wrongToken, true, 0);
        vm.expectRevert(AttestLockASC.UnsupportedToken.selector);
        _execute(wrongToken, 1);
    }

    function testRejectsSmallCollateralAndShortRemainingTerm() external {
        bytes memory small =
            _encodedLockTx(1, sourceVault, sourceToken, 99e6, uint64(block.timestamp + 14 days), lockId);
        _mockVerifier(small, true, 0);
        vm.expectRevert(AttestLockASC.CollateralBelowMinimum.selector);
        _execute(small, 1);

        vm.clearMockedCalls();
        bytes memory shortTerm = _encodedLockTx(
            1, sourceVault, sourceToken, 100e6, uint64(block.timestamp + 8 days - 1), lockId
        );
        _mockVerifier(shortTerm, true, 0);
        vm.expectRevert(AttestLockASC.InsufficientRemainingLock.selector);
        _execute(shortTerm, 1);
    }

    function testRejectsQueryReplayAndLockReplay() external {
        bytes memory encodedTx = _validEncodedTx();
        _mockVerifier(encodedTx, true, 0);
        _execute(encodedTx, 1);

        vm.expectRevert(AttestLockASC.QueryAlreadyProcessed.selector);
        _execute(encodedTx, 1);

        vm.clearMockedCalls();
        _mockVerifier(encodedTx, true, 1);
        vm.expectRevert(AttestLockASC.LockAlreadyUsed.selector);
        _execute(encodedTx, 1);
    }

    function testRejectsMalformedAndAmbiguousLockLogs() external {
        EvmV1Decoder.LogEntryTuple[] memory malformedLogs = new EvmV1Decoder.LogEntryTuple[](1);
        bytes32[] memory malformedTopics = new bytes32[](3);
        malformedTopics[0] = asc.LOCK_EVENT_SIGNATURE();
        malformedTopics[1] = lockId;
        malformedTopics[2] = bytes32(uint256(uint160(borrower)));
        malformedLogs[0] = EvmV1Decoder.LogEntryTuple({
            address_: sourceVault,
            topics: malformedTopics,
            data: abi.encode(uint256(200e6), uint64(block.timestamp + 14 days))
        });
        bytes memory malformed = _encodedTxWithLogs(1, malformedLogs);
        _mockVerifier(malformed, true, 0);
        vm.expectRevert(AttestLockASC.MalformedLockEvent.selector);
        _execute(malformed, 1);

        vm.clearMockedCalls();
        EvmV1Decoder.LogEntryTuple[] memory duplicateLogs = new EvmV1Decoder.LogEntryTuple[](2);
        duplicateLogs[0] = _validLog(lockId);
        duplicateLogs[1] = _validLog(keccak256("lock-2"));
        bytes memory duplicate = _encodedTxWithLogs(1, duplicateLogs);
        _mockVerifier(duplicate, true, 0);
        vm.expectRevert(AttestLockASC.AmbiguousLockEvents.selector);
        _execute(duplicate, 1);
    }

    function testPoolBorrowRepayAndMaturityRules() external {
        bytes memory encodedTx = _validEncodedTx();
        _mockVerifier(encodedTx, true, 0);
        _execute(encodedTx, 1);

        vm.prank(borrower);
        pool.borrow(lockId, 50e6);
        assertEq(asset.balanceOf(borrower), 50e6);
        (, uint256 limit, uint256 debt, uint64 maturity,,,,) = _lineParts(lockId);
        assertEq(limit, 100e6);
        assertEq(debt, 50e6);

        vm.prank(borrower);
        vm.expectRevert(CreditPool.LimitExceeded.selector);
        pool.borrow(lockId, 51e6);

        vm.startPrank(borrower);
        asset.approve(address(pool), 20e6);
        pool.repay(lockId, 20e6);
        vm.stopPrank();
        (,, debt,,,,,) = _lineParts(lockId);
        assertEq(debt, 30e6);

        vm.warp(maturity);
        vm.prank(borrower);
        vm.expectRevert(CreditPool.LineMatured.selector);
        pool.borrow(lockId, 1);

        vm.startPrank(borrower);
        asset.approve(address(pool), 30e6);
        pool.repay(lockId, 30e6);
        vm.stopPrank();
        (,, debt,,,,,) = _lineParts(lockId);
        assertEq(debt, 0);
        _assertProfile(1, 100e6, 50e6, 50e6, 0);
    }

    function testPoolOpenLineOnlyASC() external {
        vm.expectRevert(CreditPool.NotASC.selector);
        pool.openLine(
            lockId,
            borrower,
            50e6,
            uint64(block.timestamp + 7 days),
            100e6,
            uint64(block.timestamp + 14 days),
            bytes32(uint256(1))
        );
    }

    function testPoolRejectsInvalidAndDuplicateLines() external {
        vm.startPrank(address(asc));
        vm.expectRevert(CreditPool.InvalidLine.selector);
        pool.openLine(
            bytes32(0),
            borrower,
            50e6,
            uint64(block.timestamp + 7 days),
            100e6,
            uint64(block.timestamp + 14 days),
            bytes32(uint256(1))
        );
        vm.expectRevert(CreditPool.InvalidLine.selector);
        pool.openLine(
            lockId,
            address(0),
            50e6,
            uint64(block.timestamp + 7 days),
            100e6,
            uint64(block.timestamp + 14 days),
            bytes32(uint256(1))
        );
        vm.expectRevert(CreditPool.InvalidLine.selector);
        pool.openLine(
            lockId,
            borrower,
            0,
            uint64(block.timestamp + 7 days),
            100e6,
            uint64(block.timestamp + 14 days),
            bytes32(uint256(1))
        );

        pool.openLine(
            lockId,
            borrower,
            50e6,
            uint64(block.timestamp + 7 days),
            100e6,
            uint64(block.timestamp + 14 days),
            bytes32(uint256(1))
        );
        vm.expectRevert(CreditPool.LineAlreadyExists.selector);
        pool.openLine(
            lockId,
            borrower,
            50e6,
            uint64(block.timestamp + 7 days),
            100e6,
            uint64(block.timestamp + 14 days),
            bytes32(uint256(2))
        );
        vm.stopPrank();
    }

    function testThirdPartyCanRepayAfterMaturity() external {
        bytes memory encodedTx = _validEncodedTx();
        _mockVerifier(encodedTx, true, 0);
        _execute(encodedTx, 1);
        vm.prank(borrower);
        pool.borrow(lockId, 20e6);

        address payer = makeAddr("payer");
        asset.mint(payer, 20e6);
        vm.warp(block.timestamp + 8 days);
        vm.startPrank(payer);
        asset.approve(address(pool), 20e6);
        pool.repay(lockId, 20e6);
        vm.stopPrank();
        (,, uint256 debt,,,,) = pool.lines(lockId);
        assertEq(debt, 0);
        _assertProfile(1, 100e6, 20e6, 20e6, 0);
    }

    function testInsolventPoolCannotCreateDebt() external {
        CreditPool emptyPool = new CreditPool(address(asset), address(this));
        emptyPool.setASC(address(this));
        emptyPool.openLine(
            lockId,
            borrower,
            50e6,
            uint64(block.timestamp + 7 days),
            100e6,
            uint64(block.timestamp + 14 days),
            bytes32(uint256(1))
        );

        vm.prank(borrower);
        vm.expectRevert();
        emptyPool.borrow(lockId, 1e6);
        (,, uint256 debt,,,,) = emptyPool.lines(lockId);
        assertEq(debt, 0);
        (,, uint256 borrowed,, uint256 outstanding) = emptyPool.borrowerProfiles(borrower);
        assertEq(borrowed, 0);
        assertEq(outstanding, 0);
    }

    function testFuzzDebtNeverExceedsLimit(uint96 requested) external {
        bytes memory encodedTx = _validEncodedTx();
        _mockVerifier(encodedTx, true, 0);
        _execute(encodedTx, 1);
        uint256 amount = bound(uint256(requested), 1, 100e6);

        vm.prank(borrower);
        pool.borrow(lockId, amount);
        (, uint256 limit, uint256 debt,,,,) = pool.lines(lockId);
        assertLe(debt, limit);
        (,, uint256 totalBorrowed, uint256 totalRepaid, uint256 outstanding) = pool.borrowerProfiles(borrower);
        assertEq(totalBorrowed - totalRepaid, outstanding);
        assertEq(outstanding, debt);
    }

    function testBorrowerProfileAggregatesMultipleLinesAndCapsExcessRepayment() external {
        bytes memory first = _validEncodedTx();
        _mockVerifier(first, true, 0);
        _execute(first, 1);

        bytes32 secondLock = keccak256("lock-2");
        bytes memory second = _encodedLockTx(
            1, sourceVault, sourceToken, 300e6, uint64(block.timestamp + 14 days), secondLock
        );
        vm.clearMockedCalls();
        _mockVerifier(second, true, 1);
        _execute(second, 1);

        vm.startPrank(borrower);
        pool.borrow(lockId, 40e6);
        pool.borrow(secondLock, 60e6);
        asset.approve(address(pool), 200e6);
        pool.repay(lockId, 100e6);
        vm.stopPrank();

        _assertProfile(2, 250e6, 100e6, 40e6, 60e6);
    }

    function _assertProfile(
        uint256 expectedLines,
        uint256 expectedCredit,
        uint256 expectedBorrowed,
        uint256 expectedRepaid,
        uint256 expectedOutstanding
    ) internal view {
        (uint256 lines_, uint256 credit, uint256 borrowed, uint256 repaid, uint256 outstanding) =
            pool.borrowerProfiles(borrower);
        assertEq(lines_, expectedLines);
        assertEq(credit, expectedCredit);
        assertEq(borrowed, expectedBorrowed);
        assertEq(repaid, expectedRepaid);
        assertEq(outstanding, expectedOutstanding);
        assertEq(borrowed - repaid, outstanding);
    }

    function _validEncodedTx() internal view returns (bytes memory) {
        return _encodedLockTx(1, sourceVault, sourceToken, 200e6, uint64(block.timestamp + 14 days), lockId);
    }

    function _execute(bytes memory encodedTx, uint64 chainKey) internal {
        INativeQueryVerifier.MerkleProofEntry[] memory siblings =
            new INativeQueryVerifier.MerkleProofEntry[](0);
        bytes32[] memory continuityRoots = new bytes32[](1);
        continuityRoots[0] = merkleRoot;
        asc.verifyLockAndOpenLine(
            chainKey, blockHeight, encodedTx, merkleRoot, siblings, lowerDigest, continuityRoots
        );
    }

    function _mockVerifier(bytes memory encodedTx, bool verifyResult, uint64 txIndex) internal {
        INativeQueryVerifier.MerkleProofEntry[] memory siblings =
            new INativeQueryVerifier.MerkleProofEntry[](0);
        INativeQueryVerifier.MerkleProof memory proof =
            INativeQueryVerifier.MerkleProof({ root: merkleRoot, siblings: siblings });
        INativeQueryVerifier.ContinuityProof memory continuity =
            INativeQueryVerifier.ContinuityProof({ lowerEndpointDigest: lowerDigest, roots: _oneRoot() });

        vm.mockCall(
            PRECOMPILE,
            abi.encodeWithSelector(INativeQueryVerifier.calculateTxIndex.selector, proof),
            abi.encode(txIndex)
        );
        bytes4 verifySelector = bytes4(
            keccak256("verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))")
        );
        vm.mockCall(
            PRECOMPILE,
            abi.encodeWithSelector(verifySelector, uint64(1), blockHeight, encodedTx, proof, continuity),
            abi.encode(verifyResult)
        );
    }

    function _oneRoot() internal view returns (bytes32[] memory roots) {
        roots = new bytes32[](1);
        roots[0] = merkleRoot;
    }

    function _encodedLockTx(
        uint8 receiptStatus,
        address emitter,
        address token,
        uint256 amount,
        uint64 unlockAt,
        bytes32 eventLockId
    ) internal view returns (bytes memory) {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        bytes32[] memory topics = new bytes32[](4);
        topics[0] = asc.LOCK_EVENT_SIGNATURE();
        topics[1] = eventLockId;
        topics[2] = bytes32(uint256(uint160(borrower)));
        topics[3] = bytes32(uint256(uint160(token)));
        logs[0] = EvmV1Decoder.LogEntryTuple({
            address_: emitter, topics: topics, data: abi.encode(amount, unlockAt)
        });

        return _encodedTxWithLogs(receiptStatus, logs);
    }

    function _validLog(bytes32 eventLockId) internal view returns (EvmV1Decoder.LogEntryTuple memory entry) {
        bytes32[] memory topics = new bytes32[](4);
        topics[0] = asc.LOCK_EVENT_SIGNATURE();
        topics[1] = eventLockId;
        topics[2] = bytes32(uint256(uint160(borrower)));
        topics[3] = bytes32(uint256(uint160(sourceToken)));
        entry = EvmV1Decoder.LogEntryTuple({
            address_: sourceVault,
            topics: topics,
            data: abi.encode(uint256(200e6), uint64(block.timestamp + 14 days))
        });
    }

    function _encodedTxWithLogs(uint8 receiptStatus, EvmV1Decoder.LogEntryTuple[] memory logs)
        internal
        view
        returns (bytes memory)
    {
        bytes[] memory chunks = new bytes[](3);
        chunks[0] =
            abi.encode(uint64(1), uint64(100_000), borrower, false, sourceVault, uint256(0), bytes(""));
        chunks[1] = bytes("");
        chunks[2] = abi.encode(receiptStatus, uint64(50_000), logs, bytes(""));
        return abi.encode(uint8(2), chunks);
    }

    function _lineParts(bytes32 id)
        internal
        view
        returns (
            address recordedBorrower,
            uint256 limit,
            uint256 debt,
            uint64 maturity,
            uint256 collateral,
            uint64 unlockAt,
            bytes32 queryId,
            uint256 placeholder
        )
    {
        (recordedBorrower, limit, debt, maturity, collateral, unlockAt, queryId) = pool.lines(id);
        placeholder = 0;
    }
}
