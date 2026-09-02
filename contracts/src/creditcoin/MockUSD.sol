// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockUSD
/// @notice Testnet-only borrow asset funded into CreditPool by the deployer.
contract MockUSD is ERC20, Ownable {
    constructor(address owner_) ERC20("AttestLock Mock USD", "mUSD") Ownable(owner_) { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

