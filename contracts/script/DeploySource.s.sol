// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script, console2 } from "forge-std/Script.sol";

import { LockVault } from "../src/source/LockVault.sol";
import { MockUSDC } from "../src/source/MockUSDC.sol";

contract DeploySource is Script {
    function run() external returns (MockUSDC token, LockVault vault) {
        vm.startBroadcast();
        token = new MockUSDC();
        vault = new LockVault(address(token));
        vm.stopBroadcast();

        console2.log("MockUSDC", address(token));
        console2.log("LockVault", address(vault));
    }
}
