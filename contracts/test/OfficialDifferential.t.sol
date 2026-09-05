// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { ASCBase } from "@gluwa/asc-contracts/contracts/readability/ASCBase.sol";
import {
    INativeQueryVerifier
} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";
import { AttestLockASC } from "../src/creditcoin/AttestLockASC.sol";

contract OfficialHarness is ASCBase {
    function _processAndEmitEvent(uint8, bytes32, bytes memory) internal override { }

    function query(
        uint64 key,
        uint64 height,
        bytes32 root,
        INativeQueryVerifier.MerkleProofEntry[] calldata path
    ) external view returns (bytes32) {
        return _computeQueryId(key, height, root, path);
    }

    function proof(
        uint64 key,
        uint64 height,
        bytes calldata txBytes,
        bytes32 root,
        INativeQueryVerifier.MerkleProofEntry[] calldata path,
        bytes32 lower,
        bytes32[] calldata roots
    ) external returns (bool) {
        return _verifyProof(key, height, txBytes, root, path, lower, roots);
    }
}

contract AttestLockHarness is AttestLockASC {
    constructor() AttestLockASC(address(1), address(2), address(3)) { }

    function query(
        uint64 key,
        uint64 height,
        bytes32 root,
        INativeQueryVerifier.MerkleProofEntry[] calldata path
    ) external view returns (bytes32) {
        return _computeQueryId(key, height, root, path);
    }

    function proof(
        uint64 key,
        uint64 height,
        bytes calldata txBytes,
        bytes32 root,
        INativeQueryVerifier.MerkleProofEntry[] calldata path,
        bytes32 lower,
        bytes32[] calldata roots
    ) external returns (bool) {
        return _verifyProof(key, height, txBytes, root, path, lower, roots);
    }
}

contract RecordingVerifier {
    uint64 public index;
    bytes32 public lastCalldataHash;

    function setIndex(uint64 value) external {
        index = value;
    }

    function calculateTxIndex(INativeQueryVerifier.MerkleProof calldata) external view returns (uint64) {
        return index;
    }

    function verifyAndEmit(
        uint64,
        uint64,
        bytes calldata,
        INativeQueryVerifier.MerkleProof calldata,
        INativeQueryVerifier.ContinuityProof calldata
    ) external returns (bool) {
        lastCalldataHash = keccak256(msg.data);
        return true;
    }
}

contract OfficialDifferentialTest is Test {
    address constant PRECOMPILE = address(0x0FD2);
    OfficialHarness official;
    AttestLockHarness attestlock;

    function setUp() public {
        vm.etch(PRECOMPILE, address(new RecordingVerifier()).code);
        official = new OfficialHarness();
        attestlock = new AttestLockHarness();
    }

    function testFuzzOfficialQueryAndVerifierCalldata(
        uint64 key,
        uint64 height,
        uint64 index,
        bytes32 root,
        uint8 depth
    ) public {
        RecordingVerifier verifier = RecordingVerifier(PRECOMPILE);
        verifier.setIndex(index);
        INativeQueryVerifier.MerkleProofEntry[] memory path =
            new INativeQueryVerifier.MerkleProofEntry[](depth % 16);
        for (uint256 i; i < path.length; ++i) {
            path[i] = INativeQueryVerifier.MerkleProofEntry(keccak256(abi.encode(root, i)), i % 2 == 0);
        }
        assertEq(attestlock.query(key, height, root, path), official.query(key, height, root, path));
        bytes32[] memory roots = new bytes32[](2);
        roots[0] = root;
        roots[1] = keccak256(abi.encode(root));
        bytes memory txBytes = abi.encode(index, root, height);
        assertTrue(official.proof(key, height, txBytes, root, path, roots[1], roots));
        bytes32 expectedCalldata = verifier.lastCalldataHash();
        assertTrue(attestlock.proof(key, height, txBytes, root, path, roots[1], roots));
        assertEq(verifier.lastCalldataHash(), expectedCalldata);
    }
}
