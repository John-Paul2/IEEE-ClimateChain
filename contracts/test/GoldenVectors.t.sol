// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {DeviceRegistry} from "../src/DeviceRegistry.sol";
import {BondVault} from "../src/BondVault.sol";
import {BatchAnchor} from "../src/BatchAnchor.sol";
import {VerifierQuorum} from "../src/VerifierQuorum.sol";

/// @title GoldenVectorsTest
/// @notice Reproduces and verifies all Merkle roots, inclusion proofs, odd-node promotions, and vote commitment
///         golden test vectors from ../schemas/golden/golden_vectors.json on-chain.
contract GoldenVectorsTest is Test {
    using stdJson for string;

    DeviceRegistry internal registry;
    BondVault internal vault;
    BatchAnchor internal anchor;
    VerifierQuorum internal quorum;

    address internal admin = makeAddr("golden_admin");
    address internal treasury = makeAddr("golden_treasury");
    address internal operator = makeAddr("golden_operator");
    address internal goldenVerifier = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    string internal json;

    function setUp() public {
        vm.warp(1_700_000_000);
        json = vm.readFile("../schemas/golden/golden_vectors.json");

        vm.deal(operator, 10 ether);
        vm.deal(goldenVerifier, 10 ether);

        vm.startPrank(admin);
        registry = new DeviceRegistry(admin);
        vault = new BondVault(admin, registry, 1 ether, 0.5 ether, 180, 7000);
        anchor = new BatchAnchor(admin, registry, vault);
        quorum = new VerifierQuorum(admin, vault, anchor, treasury, 5, 3, 30, 30, 1000);

        vault.grantRole(vault.QUORUM_CONTRACT_ROLE(), address(quorum));
        anchor.grantRole(anchor.QUORUM_CONTRACT_ROLE(), address(quorum));
        quorum.registerVerifier(goldenVerifier);
        vm.stopPrank();

        bytes memory pubKey = json.readBytes(".meta.test_public_key_p256_uncompressed");
        bytes32 devId = keccak256(bytes("DEV-GOLDEN-001"));
        bytes32 instId = keccak256(bytes("INST-GOLDEN-STEEL-01"));

        vm.startPrank(operator);
        registry.registerDevice(devId, instId, operator, pubKey);
        vault.depositOperatorBond{value: 2 ether}(instId);
        vm.stopPrank();

        vm.prank(goldenVerifier);
        vault.depositVerifierStake{value: 1 ether}();
    }

    function test_Golden_Keccak256EmptySelfTest() public view {
        bytes32 expectedEmpty = json.readBytes32(".meta.keccak256_empty_self_test");
        assertEq(keccak256(""), expectedEmpty);
    }

    function test_Golden_MerkleProofs_BaselineCleanAndTamperedAndReplayed() public {
        _verifyChainProofs(".chains.baseline_clean", keccak256("DEV-CLEAN"), 8);
        _verifyChainProofs(".chains.chain_1_tampered", keccak256("DEV-TAMPERED"), 8);
        _verifyChainProofs(".chains.chain_3_replayed", keccak256("DEV-REPLAYED"), 8);
    }

    function test_Golden_MerkleProofs_SeqGapOddNodePromotion() public {
        // chain_2_seq_gap has 7 packets (odd leaf count at level 0 and level 1 -> exercises DECISION-04 odd-node promotion)
        _verifyChainProofs(".chains.chain_2_seq_gap", keccak256("DEV-SEQ-GAP"), 7);
    }

    function test_Golden_VoteCommitmentAndRevealVector() public {
        bytes32 devId = keccak256(bytes("DEV-GOLDEN-001"));

        // Anchor batch 1 (baseline_clean) then batch 2 (chain_1_tampered) so batchId == 2 matches the golden vector
        bytes32 cleanRoot = json.readBytes32(".chains.baseline_clean.batch.merkle_root");
        bytes32 tamperedRoot = json.readBytes32(".chains.chain_1_tampered.batch.merkle_root");

        vm.startPrank(operator);
        uint256 b1 = anchor.anchorBatch(devId, cleanRoot, 0, 7, 8);
        uint256 b2 = anchor.anchorBatch(devId, tamperedRoot, 8, 15, 8);
        vm.stopPrank();
        assertEq(b1, 1);
        assertEq(b2, 2);

        uint256 batchId = json.readUint(".vote_commitment_vector.verdict_object.batch_id");
        bytes32 modelHash = json.readBytes32(".vote_commitment_vector.verdict_object.model_hash");
        bytes32 inputHash = json.readBytes32(".vote_commitment_vector.verdict_object.input_hash");
        uint16 scoreBp = uint16(json.readUint(".vote_commitment_vector.verdict_object.score_bp"));
        uint8 verdictRaw = uint8(json.readUint(".vote_commitment_vector.verdict_object.verdict"));
        bytes32 salt = json.readBytes32(".vote_commitment_vector.verdict_object.salt");
        bytes32 expectedCommitment = json.readBytes32(".vote_commitment_vector.verdict_object.vote_commitment");
        bytes memory expectedPreimage = json.readBytes(".vote_commitment_vector.abi_encoded_preimage_hex");

        bytes memory encodedPreimage = abi.encode(batchId, modelHash, inputHash, scoreBp, verdictRaw, salt);
        assertEq(encodedPreimage.length, 192, "ABI-encoded preimage must be 192 bytes (6 words)");
        assertEq(keccak256(encodedPreimage), keccak256(expectedPreimage), "ABI preimage mismatch");

        VerifierQuorum.Verdict verdict = VerifierQuorum.Verdict(verdictRaw);
        bytes32 computedCommitment = quorum.computeCommitment(
            batchId,
            modelHash,
            inputHash,
            scoreBp,
            verdict,
            salt
        );
        assertEq(computedCommitment, expectedCommitment, "Vote commitment hash mismatch");

        // Exercise on-chain commitVote and revealVote with the exact golden vector
        vm.prank(goldenVerifier);
        quorum.commitVote(batchId, expectedCommitment);

        vm.warp(block.timestamp + 31);
        vm.prank(goldenVerifier);
        quorum.revealVote(
            batchId,
            modelHash,
            inputHash,
            scoreBp,
            verdict,
            salt,
            "SIG_INVALID,CHAIN_BREAK,PHYSICS_RESIDUAL"
        );

        VerifierQuorum.RevealedVote memory rv = quorum.getVote(batchId, goldenVerifier);
        assertTrue(rv.revealed);
        assertEq(rv.verifier, goldenVerifier);
        assertEq(rv.modelHash, modelHash);
        assertEq(rv.inputHash, inputHash);
        assertEq(rv.scoreBp, scoreBp);
        assertEq(uint8(rv.verdict), verdictRaw);
    }

    function _verifyChainProofs(string memory chainKey, bytes32 devId, uint32 leafCount) internal {
        bytes memory pubKey = json.readBytes(".meta.test_public_key_p256_uncompressed");
        bytes32 instId = keccak256(bytes("INST-GOLDEN-STEEL-01"));

        vm.prank(operator);
        registry.registerDevice(devId, instId, operator, pubKey);

        bytes32 merkleRoot = json.readBytes32(string(abi.encodePacked(chainKey, ".merkle.merkle_root")));

        vm.prank(operator);
        uint256 batchId = anchor.anchorBatch(devId, merkleRoot, 0, uint64(leafCount) - 1, leafCount);

        for (uint256 i = 0; i < leafCount; ++i) {
            string memory proofBase = string(
                abi.encodePacked(chainKey, ".merkle.proofs[", vm.toString(i), "]")
            );
            bytes32 packetHash = json.readBytes32(string(abi.encodePacked(proofBase, ".packet_hash")));
            bytes32 expectedLeafHash = json.readBytes32(string(abi.encodePacked(proofBase, ".leaf_hash")));
            bytes32[] memory siblings = json.readBytes32Array(string(abi.encodePacked(proofBase, ".siblings")));

            // Verify domain-separated leaf formula: keccak256(bytes32(packet_hash))
            assertEq(keccak256(abi.encodePacked(packetHash)), expectedLeafHash, "Leaf hash formula mismatch");

            // Verify on-chain Merkle inclusion proof in BatchAnchor
            bool included = anchor.verifyPacketInclusion(batchId, packetHash, siblings);
            assertTrue(included, "Golden Merkle proof failed on-chain verification");

            // Tampering with packetHash must fail inclusion proof
            bool tamperedIncluded = anchor.verifyPacketInclusion(
                batchId,
                bytes32(uint256(packetHash) ^ 1),
                siblings
            );
            assertFalse(tamperedIncluded, "Tampered packetHash unexpectedly passed inclusion proof");
        }
    }
}
