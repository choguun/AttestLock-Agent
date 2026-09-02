// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Testnet-only collateral token with a one-time per-address faucet.
contract MockUSDC is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 1_000e6;

    mapping(address account => bool claimed) public faucetClaimed;

    error FaucetAlreadyClaimed();

    constructor() ERC20("AttestLock Mock USDC", "mUSDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet() external {
        if (faucetClaimed[msg.sender]) revert FaucetAlreadyClaimed();
        faucetClaimed[msg.sender] = true;
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}

