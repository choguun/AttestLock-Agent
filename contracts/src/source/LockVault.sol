// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title LockVault
/// @notice Escrows one supported Sepolia token and emits the fact consumed by AttestLockASC.
contract LockVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MIN_LOCK_AMOUNT = 100e6;
    uint64 public constant MIN_LOCK_DURATION = 14 days;

    IERC20 public immutable collateralToken;
    uint256 public nextNonce;

    struct LockPosition {
        address borrower;
        uint256 amount;
        uint64 unlockAt;
        bool withdrawn;
    }

    mapping(bytes32 lockId => LockPosition position) public positions;

    event CollateralLocked(
        bytes32 indexed lockId,
        address indexed borrower,
        address indexed token,
        uint256 amount,
        uint64 unlockAt
    );
    event CollateralWithdrawn(bytes32 indexed lockId, address indexed borrower, uint256 amount);

    error AmountBelowMinimum();
    error LockDurationTooShort();
    error UnknownLock();
    error NotBorrower();
    error LockNotExpired();
    error AlreadyWithdrawn();

    constructor(address token) {
        require(token != address(0), "token=0");
        collateralToken = IERC20(token);
    }

    function lock(uint256 amount, uint64 unlockAt) external nonReentrant returns (bytes32 lockId) {
        if (amount < MIN_LOCK_AMOUNT) revert AmountBelowMinimum();
        if (unlockAt < block.timestamp + MIN_LOCK_DURATION) revert LockDurationTooShort();

        uint256 nonce = ++nextNonce;
        lockId = keccak256(abi.encode(block.chainid, address(this), msg.sender, nonce));
        positions[lockId] =
            LockPosition({ borrower: msg.sender, amount: amount, unlockAt: unlockAt, withdrawn: false });

        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        emit CollateralLocked(lockId, msg.sender, address(collateralToken), amount, unlockAt);
    }

    function withdraw(bytes32 lockId) external nonReentrant {
        LockPosition storage position = positions[lockId];
        if (position.borrower == address(0)) revert UnknownLock();
        if (position.borrower != msg.sender) revert NotBorrower();
        if (position.withdrawn) revert AlreadyWithdrawn();
        if (block.timestamp < position.unlockAt) revert LockNotExpired();

        position.withdrawn = true;
        collateralToken.safeTransfer(msg.sender, position.amount);
        emit CollateralWithdrawn(lockId, msg.sender, position.amount);
    }
}

