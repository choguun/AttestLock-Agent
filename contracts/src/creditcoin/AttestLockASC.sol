// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { EvmV1Decoder } from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {
    INativeQueryVerifier,
    NativeQueryVerifierLib
} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";

import { ICreditPool } from "./CreditPool.sol";

/// @title AttestLockASC
/// @notice Opens Creditcoin credit only after proving and validating a Sepolia collateral lock.
contract AttestLockASC {
    uint64 public constant SEPOLIA_CHAIN_KEY = 1;
    uint256 public constant MIN_COLLATERAL = 100e6;
    uint256 public constant LTV_BPS = 5_000;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint64 public constant LINE_DURATION = 7 days;
    uint64 public constant COLLATERAL_BUFFER = 1 days;
    bytes32 public constant LOCK_EVENT_SIGNATURE =
        keccak256("CollateralLocked(bytes32,address,address,uint256,uint64)");

    INativeQueryVerifier public immutable verifier;
    ICreditPool public immutable pool;
    address public immutable sourceVault;
    address public immutable sourceToken;

    mapping(bytes32 queryId => bool processed) public processedQueries;
    mapping(bytes32 lockId => bool used) public usedLocks;

    event LockVerifiedAndLineOpened(
        bytes32 indexed queryId,
        bytes32 indexed lockId,
        address indexed borrower,
        uint256 collateralAmount,
        uint256 creditLimit,
        uint64 maturity,
        uint64 collateralUnlockAt
    );

    error UnsupportedChain();
    error QueryAlreadyProcessed();
    error ProofVerificationFailed();
    error UnsupportedTransactionType();
    error SourceTransactionFailed();
    error MissingLockEvent();
    error AmbiguousLockEvents();
    error MalformedLockEvent();
    error UnsupportedToken();
    error CollateralBelowMinimum();
    error InsufficientRemainingLock();
    error LockAlreadyUsed();

    constructor(address pool_, address sourceVault_, address sourceToken_) {
        require(pool_ != address(0) && sourceVault_ != address(0) && sourceToken_ != address(0), "address=0");
        verifier = NativeQueryVerifierLib.getVerifier();
        pool = ICreditPool(pool_);
        sourceVault = sourceVault_;
        sourceToken = sourceToken_;
    }

    function verifyLockAndOpenLine(
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
        bytes32 lowerEndpointDigest,
        bytes32[] calldata continuityRoots
    ) external returns (bool success) {
        if (chainKey != SEPOLIA_CHAIN_KEY) revert UnsupportedChain();

        bytes32 queryId = _computeQueryId(chainKey, blockHeight, merkleRoot, siblings);
        if (processedQueries[queryId]) revert QueryAlreadyProcessed();

        INativeQueryVerifier.MerkleProof memory merkleProof =
            INativeQueryVerifier.MerkleProof({ root: merkleRoot, siblings: siblings });
        INativeQueryVerifier.ContinuityProof memory continuityProof = INativeQueryVerifier.ContinuityProof({
            lowerEndpointDigest: lowerEndpointDigest, roots: continuityRoots
        });
        bool verified =
            verifier.verifyAndEmit(chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof);
        if (!verified) revert ProofVerificationFailed();

        (bytes32 lockId, address borrower, uint256 amount, uint64 unlockAt) =
            _decodeAndValidateLock(encodedTransaction);
        if (usedLocks[lockId]) revert LockAlreadyUsed();

        uint64 maturity = uint64(block.timestamp) + LINE_DURATION;
        if (unlockAt < maturity + COLLATERAL_BUFFER) revert InsufficientRemainingLock();
        uint256 creditLimit = amount * LTV_BPS / BPS_DENOMINATOR;

        processedQueries[queryId] = true;
        usedLocks[lockId] = true;
        pool.openLine(lockId, borrower, creditLimit, maturity, amount, unlockAt, queryId);

        emit LockVerifiedAndLineOpened(queryId, lockId, borrower, amount, creditLimit, maturity, unlockAt);
        return true;
    }

    function _computeQueryId(
        uint64 chainKey,
        uint64 blockHeight,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings
    ) internal view returns (bytes32 queryId) {
        INativeQueryVerifier.MerkleProof memory
            merkleProof = INativeQueryVerifier.MerkleProof({ root: merkleRoot, siblings: siblings });
        uint256 txIndex = verifier.calculateTxIndex(merkleProof);
        queryId = keccak256(abi.encodePacked(uint256(chainKey), blockHeight, txIndex));
    }

    function _decodeAndValidateLock(bytes memory encodedTransaction)
        internal
        view
        returns (bytes32 lockId, address borrower, uint256 amount, uint64 unlockAt)
    {
        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        if (!EvmV1Decoder.isValidTransactionType(txType)) revert UnsupportedTransactionType();

        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert SourceTransactionFailed();

        EvmV1Decoder.LogEntry[] memory logs =
            EvmV1Decoder.getLogsByEventSignature(receipt, LOCK_EVENT_SIGNATURE);
        uint256 matches;
        for (uint256 i; i < logs.length; ++i) {
            EvmV1Decoder.LogEntry memory candidate = logs[i];
            if (candidate.address_ != sourceVault) continue;
            if (candidate.topics.length != 4 || candidate.data.length != 64) revert MalformedLockEvent();

            bytes32 candidateLockId = candidate.topics[1];
            address candidateBorrower = address(uint160(uint256(candidate.topics[2])));
            address candidateToken = address(uint160(uint256(candidate.topics[3])));
            if (candidateToken != sourceToken) revert UnsupportedToken();

            (uint256 candidateAmount, uint64 candidateUnlockAt) =
                abi.decode(candidate.data, (uint256, uint64));
            ++matches;
            lockId = candidateLockId;
            borrower = candidateBorrower;
            amount = candidateAmount;
            unlockAt = candidateUnlockAt;
        }

        if (matches == 0) revert MissingLockEvent();
        if (matches > 1) revert AmbiguousLockEvents();
        if (amount < MIN_COLLATERAL) revert CollateralBelowMinimum();
    }
}

