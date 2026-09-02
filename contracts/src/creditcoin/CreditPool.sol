// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ICreditPool {
    function openLine(
        bytes32 lockId,
        address borrower,
        uint256 limit,
        uint64 maturity,
        uint256 collateralAmount,
        uint64 collateralUnlockAt,
        bytes32 queryId
    ) external;
}

/// @title CreditPool
/// @notice Testnet pool whose lines can only be opened by the configured AttestLock ASC.
contract CreditPool is ICreditPool, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    address public asc;

    struct CreditLine {
        address borrower;
        uint256 limit;
        uint256 debt;
        uint64 maturity;
        uint256 collateralAmount;
        uint64 collateralUnlockAt;
        bytes32 queryId;
    }

    mapping(bytes32 lockId => CreditLine line) public lines;

    event ASCConfigured(address indexed asc);
    event CreditLineOpened(
        bytes32 indexed lockId,
        address indexed borrower,
        uint256 limit,
        uint64 maturity,
        bytes32 indexed queryId
    );
    event Borrowed(bytes32 indexed lockId, address indexed borrower, uint256 amount, uint256 debt);
    event Repaid(bytes32 indexed lockId, address indexed payer, uint256 amount, uint256 debt);

    error ASCAlreadyConfigured();
    error NotASC();
    error InvalidLine();
    error LineAlreadyExists();
    error NotBorrower();
    error LineMatured();
    error InvalidAmount();
    error LimitExceeded();
    error NoDebt();

    constructor(address asset_, address owner_) Ownable(owner_) {
        require(asset_ != address(0), "asset=0");
        asset = IERC20(asset_);
    }

    modifier onlyASC() {
        if (msg.sender != asc) revert NotASC();
        _;
    }

    function setASC(address asc_) external onlyOwner {
        if (asc != address(0)) revert ASCAlreadyConfigured();
        require(asc_ != address(0), "asc=0");
        asc = asc_;
        emit ASCConfigured(asc_);
    }

    function openLine(
        bytes32 lockId,
        address borrower,
        uint256 limit,
        uint64 maturity,
        uint256 collateralAmount,
        uint64 collateralUnlockAt,
        bytes32 queryId
    ) external onlyASC {
        if (
            lockId == bytes32(0) || borrower == address(0) || limit == 0 || maturity <= block.timestamp
                || collateralUnlockAt <= maturity
        ) revert InvalidLine();
        if (lines[lockId].borrower != address(0)) revert LineAlreadyExists();

        lines[lockId] = CreditLine({
            borrower: borrower,
            limit: limit,
            debt: 0,
            maturity: maturity,
            collateralAmount: collateralAmount,
            collateralUnlockAt: collateralUnlockAt,
            queryId: queryId
        });
        emit CreditLineOpened(lockId, borrower, limit, maturity, queryId);
    }

    function borrow(bytes32 lockId, uint256 amount) external nonReentrant {
        CreditLine storage line = lines[lockId];
        if (line.borrower != msg.sender) revert NotBorrower();
        if (block.timestamp >= line.maturity) revert LineMatured();
        if (amount == 0) revert InvalidAmount();
        if (line.debt + amount > line.limit) revert LimitExceeded();

        line.debt += amount;
        asset.safeTransfer(msg.sender, amount);
        emit Borrowed(lockId, msg.sender, amount, line.debt);
    }

    function repay(bytes32 lockId, uint256 amount) external nonReentrant returns (uint256 paid) {
        CreditLine storage line = lines[lockId];
        if (line.borrower == address(0)) revert InvalidLine();
        if (line.debt == 0) revert NoDebt();
        if (amount == 0) revert InvalidAmount();

        paid = amount > line.debt ? line.debt : amount;
        line.debt -= paid;
        asset.safeTransferFrom(msg.sender, address(this), paid);
        emit Repaid(lockId, msg.sender, paid, line.debt);
    }

    function available(bytes32 lockId) external view returns (uint256) {
        CreditLine storage line = lines[lockId];
        return line.limit > line.debt ? line.limit - line.debt : 0;
    }
}

