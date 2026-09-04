// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script, console2 } from "forge-std/Script.sol";

import { AttestLockASC } from "../src/creditcoin/AttestLockASC.sol";
import { CreditPool } from "../src/creditcoin/CreditPool.sol";
import { MockUSD } from "../src/creditcoin/MockUSD.sol";

contract DeployCreditcoin is Script {
    uint256 internal constant DEFAULT_POOL_LIQUIDITY = 1_000_000e6;

    function run() external returns (MockUSD asset, CreditPool pool, AttestLockASC asc) {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address sourceVault = vm.envAddress("SOURCE_VAULT_ADDRESS");
        address sourceToken = vm.envAddress("SOURCE_TOKEN_ADDRESS");
        uint256 liquidity = vm.envOr("POOL_LIQUIDITY", DEFAULT_POOL_LIQUIDITY);

        vm.startBroadcast();
        asset = new MockUSD(deployer);
        pool = new CreditPool(address(asset), deployer);
        asc = new AttestLockASC(address(pool), sourceVault, sourceToken);
        pool.setASC(address(asc));
        asset.mint(address(pool), liquidity);
        vm.stopBroadcast();

        console2.log("MockUSD", address(asset));
        console2.log("CreditPool", address(pool));
        console2.log("AttestLockASC", address(asc));
        console2.log("PoolLiquidity", liquidity);
    }
}
