// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script, console2 } from "forge-std/Script.sol";

import { LockVault } from "../src/source/LockVault.sol";
import { MockUSDC } from "../src/source/MockUSDC.sol";

contract DeploySource is Script {
    function run() external returns (MockUSDC token, LockVault vault) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        token = new MockUSDC();
        vault = new LockVault(address(token));
        vm.stopBroadcast();

        console2.log("MockUSDC", address(token));
        console2.log("LockVault", address(vault));
    }
}
