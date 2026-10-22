// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeviceRegistry} from "../src/DeviceRegistry.sol";
import {BondVault} from "../src/BondVault.sol";
import {BatchAnchor} from "../src/BatchAnchor.sol";
import {VerifierQuorum, IChallenge} from "../src/VerifierQuorum.sol";
import {Challenge} from "../src/Challenge.sol";
import {Attestation} from "../src/Attestation.sol";
import {Deploy} from "../script/Deploy.s.sol";

/// @notice Helper contract that rejects incoming ETH transfers to test BondVault.TransferFailed.
contract RevertingReceiver {
    receive() external payable {
        revert("ETH rejected");
    }
}

/// @title UnitAndScenarioTest
/// @notice Unit tests for every function and revert path across all 6 contracts, plus the 6 end-to-end scenario tests.
contract UnitAndScenarioTest is Test {
    DeviceRegistry internal registry;
    BondVault internal vault;
    BatchAnchor internal anchor;
    VerifierQuorum internal quorum;
    Challenge internal challenge;
    Attestation internal attestation;

    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal operator = makeAddr("operator");
    address internal stranger = makeAddr("stranger");

    address[] internal verifiers;
    address[] internal arbiters;

    bytes32 internal constant INST_ID = keccak256("INST-IND-STEEL-01");
    bytes32 internal constant DEV_ID = keccak256("DEV-STEEL-001");
    bytes32 internal constant MODEL_HASH = 0x9dfa4c50906452325e5d241d82c765aa89c7aac01897ff4af47c9eaebb4f5d01;
    bytes32 internal constant SAMPLE_ROOT = 0xfef6845c31a5bde0f7b6cc96792c8ec76aab269de617cf1e8c25593267b309cc;
    bytes internal validPubKey =
        hex"04758440df308461b9cc4dccfbca96be10ca28c8f3f6944c90da43de58f05b38db46383a9f357bf06d9cb74b2686822dd580150e5b16b8b6536949595ddff0ca21";
    bytes internal rotatedPubKey =
        hex"0411111111111111111111111111111111111111111111111111111111111111112222222222222222222222222222222222222222222222222222222222222222";

    uint256 internal constant MIN_OP_BOND = 1 ether;
    uint256 internal constant MIN_VER_STAKE = 0.5 ether;
    uint64 internal constant COMMIT_WINDOW = 30;
    uint64 internal constant REVEAL_WINDOW = 30;
    uint64 internal constant CHALLENGE_WINDOW = 120;
    uint64 internal constant WITHDRAW_DELAY = 180;
    uint16 internal constant OP_SLASH_BPS = 5000; // 50%
    uint16 internal constant VER_REWARD_SHARE_BPS = 7000; // 70%
    uint16 internal constant CARELESS_SLASH_BPS = 1000; // 10%
    uint16 internal constant UNREVEALED_PENALTY_BPS = 1000; // 10%

    function setUp() public {
        vm.warp(1_700_000_000);

        for (uint256 i = 0; i < 5; ++i) {
            address v = makeAddr(string(abi.encodePacked("verifier", vm.toString(i))));
            verifiers.push(v);
            vm.deal(v, 10 ether);
        }
        for (uint256 i = 0; i < 3; ++i) {
            address a = makeAddr(string(abi.encodePacked("arbiter", vm.toString(i))));
            arbiters.push(a);
        }

        vm.deal(operator, 20 ether);
        vm.deal(stranger, 10 ether);

        vm.startPrank(admin);
        registry = new DeviceRegistry(admin);
        vault = new BondVault(
            admin,
            registry,
            MIN_OP_BOND,
            MIN_VER_STAKE,
            WITHDRAW_DELAY,
            VER_REWARD_SHARE_BPS
        );
        anchor = new BatchAnchor(admin, registry, vault);
        quorum = new VerifierQuorum(
            admin,
            vault,
            anchor,
            treasury,
            5,
            3,
            COMMIT_WINDOW,
            REVEAL_WINDOW,
            UNREVEALED_PENALTY_BPS
        );
        challenge = new Challenge(
            admin,
            registry,
            vault,
            anchor,
            quorum,
            treasury,
            CHALLENGE_WINDOW,
            OP_SLASH_BPS,
            CARELESS_SLASH_BPS,
            2
        );
        attestation = new Attestation(admin, registry, anchor);

        vault.grantRole(vault.CHALLENGE_CONTRACT_ROLE(), address(challenge));
        vault.grantRole(vault.QUORUM_CONTRACT_ROLE(), address(quorum));
        anchor.grantRole(anchor.QUORUM_CONTRACT_ROLE(), address(quorum));
        anchor.grantRole(anchor.CHALLENGE_CONTRACT_ROLE(), address(challenge));
        quorum.setChallengeContract(IChallenge(address(challenge)));

        for (uint256 i = 0; i < 5; ++i) {
            quorum.registerVerifier(verifiers[i]);
            challenge.grantRole(challenge.VERIFIER_ROLE(), verifiers[i]);
        }
        for (uint256 i = 0; i < 3; ++i) {
            challenge.grantRole(challenge.ARBITER_ROLE(), arbiters[i]);
        }
        vm.stopPrank();

        // Stake all 5 verifiers
        for (uint256 i = 0; i < 5; ++i) {
            vm.prank(verifiers[i]);
            vault.depositVerifierStake{value: MIN_VER_STAKE}();
        }
    }

    // =========================================================================
    // 1. DeviceRegistry Unit & Revert Tests
    // =========================================================================

    function test_DeviceRegistry_ConstructorZeroAddressReverts() public {
        vm.expectRevert(DeviceRegistry.ZeroAddress.selector);
        new DeviceRegistry(address(0));
    }

    function test_DeviceRegistry_RegisterRotateRevokeLifecycle() public {
        vm.prank(operator);
        registry.registerDevice(DEV_ID, INST_ID, operator, validPubKey);

        assertTrue(registry.isDeviceActive(DEV_ID));
        assertEq(registry.getInstallationOperator(INST_ID), operator);

        DeviceRegistry.DeviceInfo memory info = registry.getDevice(DEV_ID);
        assertEq(info.installationId, INST_ID);
        assertEq(info.operator, operator);
        assertEq(keccak256(info.pubKeyP256), keccak256(validPubKey));
        assertEq(uint8(info.status), uint8(DeviceRegistry.DeviceStatus.Active));

        // Rotate key
        vm.prank(operator);
        registry.rotateKey(DEV_ID, rotatedPubKey);
        assertEq(keccak256(registry.getDevice(DEV_ID).pubKeyP256), keccak256(rotatedPubKey));

        // Revoke device
        vm.prank(operator);
        registry.revokeDevice(DEV_ID, "Sensor decommissioned");
        assertFalse(registry.isDeviceActive(DEV_ID));
        assertEq(uint8(registry.getDevice(DEV_ID).status), uint8(DeviceRegistry.DeviceStatus.Revoked));
    }

    function test_DeviceRegistry_RevertPaths() public {
        // Zero operator address
        vm.prank(admin);
        vm.expectRevert(DeviceRegistry.ZeroAddress.selector);
        registry.registerDevice(DEV_ID, INST_ID, address(0), validPubKey);

        // Zero identifiers
        vm.prank(operator);
        vm.expectRevert(DeviceRegistry.InvalidIdentifier.selector);
        registry.registerDevice(bytes32(0), INST_ID, operator, validPubKey);

        vm.prank(operator);
        vm.expectRevert(DeviceRegistry.InvalidIdentifier.selector);
        registry.registerDevice(DEV_ID, bytes32(0), operator, validPubKey);

        // Unauthorized caller trying to register for another operator
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(DeviceRegistry.UnauthorizedCaller.selector, stranger));
        registry.registerDevice(DEV_ID, INST_ID, operator, validPubKey);

        // Invalid public key length
        bytes memory shortKey = hex"041234";
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(DeviceRegistry.InvalidPublicKeyLength.selector, 3));
        registry.registerDevice(DEV_ID, INST_ID, operator, shortKey);

        // Invalid prefix (not 0x04)
        bytes memory badPrefixKey = new bytes(65);
        badPrefixKey[0] = 0x02;
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(DeviceRegistry.InvalidPublicKeyLength.selector, 65));
        registry.registerDevice(DEV_ID, INST_ID, operator, badPrefixKey);

        // Rotate / revoke non-existent device
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(DeviceRegistry.DeviceNotFound.selector, DEV_ID));
        registry.rotateKey(DEV_ID, rotatedPubKey);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(DeviceRegistry.DeviceNotFound.selector, DEV_ID));
        registry.revokeDevice(DEV_ID, "none");

        // Register valid device
        vm.prank(operator);
        registry.registerDevice(DEV_ID, INST_ID, operator, validPubKey);

        // Duplicate registration
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(DeviceRegistry.DeviceAlreadyRegistered.selector, DEV_ID));
        registry.registerDevice(DEV_ID, INST_ID, operator, validPubKey);

        // Another non-admin operator trying to register under the same installation
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(DeviceRegistry.UnauthorizedCaller.selector, stranger));
        registry.registerDevice(keccak256("DEV-2"), INST_ID, stranger, validPubKey);

        // Unauthorized rotate and revoke
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(DeviceRegistry.UnauthorizedCaller.selector, stranger));
        registry.rotateKey(DEV_ID, rotatedPubKey);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(DeviceRegistry.UnauthorizedCaller.selector, stranger));
        registry.revokeDevice(DEV_ID, "hack");

        // Revoke then try to rotate or revoke again
        vm.prank(admin);
        registry.revokeDevice(DEV_ID, "admin revoke");

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(DeviceRegistry.DeviceNotActive.selector, DEV_ID));
        registry.rotateKey(DEV_ID, rotatedPubKey);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(DeviceRegistry.DeviceNotActive.selector, DEV_ID));
        registry.revokeDevice(DEV_ID, "again");

        // setInstallationOperator revert paths
        vm.prank(admin);
        vm.expectRevert(DeviceRegistry.ZeroAddress.selector);
        registry.setInstallationOperator(INST_ID, address(0));

        vm.prank(admin);
        vm.expectRevert(DeviceRegistry.InvalidIdentifier.selector);
        registry.setInstallationOperator(bytes32(0), operator);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(DeviceRegistry.UnauthorizedCaller.selector, stranger));
        registry.setInstallationOperator(INST_ID, stranger);

        // Pause / unpause
        vm.prank(admin);
        registry.pause();
        vm.prank(admin);
        vm.expectRevert();
        registry.setInstallationOperator(INST_ID, operator);
        vm.prank(admin);
        registry.unpause();
        vm.prank(admin);
        registry.setInstallationOperator(INST_ID, operator);
    }

    // =========================================================================
    // 2. BondVault Unit & Revert Tests
    // =========================================================================

    function test_BondVault_ConstructorAndRevertPaths() public {
        vm.expectRevert(BondVault.ZeroAddress.selector);
        new BondVault(address(0), registry, 1 ether, 0.5 ether, 180, 7000);

        vm.expectRevert(abi.encodeWithSelector(BondVault.InvalidBps.selector, 10001));
        new BondVault(admin, registry, 1 ether, 0.5 ether, 180, 10001);

        // Zero deposits
        vm.prank(operator);
        vm.expectRevert(BondVault.ZeroDeposit.selector);
        vault.depositOperatorBond{value: 0}(INST_ID);

        vm.prank(operator);
        vm.expectRevert(BondVault.ZeroAddress.selector);
        vault.depositOperatorBond{value: 1 ether}(bytes32(0));

        vm.prank(verifiers[0]);
        vm.expectRevert(BondVault.ZeroDeposit.selector);
        vault.depositVerifierStake{value: 0}();

        // Deposit operator bond
        vm.prank(operator);
        vault.depositOperatorBond{value: 2 ether}(INST_ID);
        assertEq(vault.operatorBondOf(INST_ID), 2 ether);
        assertTrue(vault.hasSufficientOperatorBond(INST_ID));

        // Unauthorized withdraw request
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(BondVault.UnauthorizedCaller.selector, stranger));
        vault.requestOperatorWithdraw(INST_ID, 0.5 ether);

        // Zero amount withdraw request
        vm.prank(operator);
        vm.expectRevert(BondVault.ZeroAmount.selector);
        vault.requestOperatorWithdraw(INST_ID, 0);

        // Excessive withdraw request
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(BondVault.InsufficientBondBalance.selector, 2 ether, 3 ether));
        vault.requestOperatorWithdraw(INST_ID, 3 ether);

        // Execute without pending request
        vm.prank(operator);
        vm.expectRevert(BondVault.NoPendingWithdrawal.selector);
        vault.executeOperatorWithdraw(INST_ID);

        // Request and try to execute before delay
        vm.prank(operator);
        vault.requestOperatorWithdraw(INST_ID, 0.5 ether);

        uint64 expectedUnlock = uint64(block.timestamp) + WITHDRAW_DELAY;
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                BondVault.WithdrawalDelayNotElapsed.selector,
                uint64(block.timestamp),
                expectedUnlock
            )
        );
        vault.executeOperatorWithdraw(INST_ID);

        // Advance time and execute
        vm.warp(block.timestamp + WITHDRAW_DELAY);
        uint256 balBefore = operator.balance;
        vm.prank(operator);
        vault.executeOperatorWithdraw(INST_ID);
        assertEq(operator.balance, balBefore + 0.5 ether);
        assertEq(vault.operatorBondOf(INST_ID), 1.5 ether);

        // Verifier withdraw flow & reverts
        vm.prank(verifiers[0]);
        vm.expectRevert(BondVault.ZeroAmount.selector);
        vault.requestVerifierWithdraw(0);

        vm.prank(verifiers[0]);
        vm.expectRevert(
            abi.encodeWithSelector(BondVault.InsufficientBondBalance.selector, MIN_VER_STAKE, 2 ether)
        );
        vault.requestVerifierWithdraw(2 ether);

        vm.prank(verifiers[0]);
        vm.expectRevert(BondVault.NoPendingWithdrawal.selector);
        vault.executeVerifierWithdraw();

        vm.prank(verifiers[0]);
        vault.requestVerifierWithdraw(0.1 ether);

        vm.prank(verifiers[0]);
        vm.expectRevert();
        vault.executeVerifierWithdraw();

        vm.warp(block.timestamp + WITHDRAW_DELAY);
        vm.prank(verifiers[0]);
        vault.executeVerifierWithdraw();
        assertEq(vault.verifierStakeOf(verifiers[0]), MIN_VER_STAKE - 0.1 ether);
        assertFalse(vault.hasSufficientVerifierStake(verifiers[0]));

        // Unauthorized slash calls
        address[] memory emptyVerifiers = new address[](0);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(BondVault.UnauthorizedCaller.selector, stranger));
        vault.slashOperator(INST_ID, 0.1 ether, emptyVerifiers, treasury);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(BondVault.UnauthorizedCaller.selector, stranger));
        vault.slashVerifier(verifiers[0], 0.1 ether, treasury);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(BondVault.UnauthorizedCaller.selector, stranger));
        vault.setChallengeStatus(INST_ID, true);

        // Nothing to claim
        vm.prank(stranger);
        vm.expectRevert(BondVault.NothingToClaim.selector);
        vault.claimRewards();

        // Update parameters and pause/unpause
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(BondVault.InvalidBps.selector, 10001));
        vault.updateParameters(MIN_OP_BOND, MIN_VER_STAKE, WITHDRAW_DELAY, 10001);

        vm.prank(admin);
        vault.updateParameters(MIN_OP_BOND, MIN_VER_STAKE, WITHDRAW_DELAY, VER_REWARD_SHARE_BPS);

        vm.prank(admin);
        vault.pause();
        vm.prank(admin);
        vault.unpause();
    }

    function test_BondVault_TransferFailedReverts() public {
        RevertingReceiver badReceiver = new RevertingReceiver();
        vm.deal(address(badReceiver), 2 ether);

        vm.prank(operator);
        vault.depositOperatorBond{value: 2 ether}(INST_ID);

        address[] memory honest = new address[](1);
        honest[0] = verifiers[0];

        // Authorize admin as challenge contract temporarily to test TransferFailed on claimRewards
        vm.startPrank(admin);
        vault.grantRole(vault.CHALLENGE_CONTRACT_ROLE(), admin);
        vault.slashOperator(INST_ID, 1 ether, honest, address(badReceiver));
        vm.stopPrank();

        vm.prank(address(badReceiver));
        vm.expectRevert(BondVault.TransferFailed.selector);
        vault.claimRewards();
    }

    // =========================================================================
    // 3. BatchAnchor, VerifierQuorum, Challenge, Attestation Revert Tests
    // =========================================================================

    function test_BatchAnchor_RevertPaths() public {
        vm.expectRevert(BatchAnchor.ZeroAddress.selector);
        new BatchAnchor(address(0), registry, vault);

        // Empty merkle root
        vm.prank(operator);
        vm.expectRevert(BatchAnchor.EmptyMerkleRoot.selector);
        anchor.anchorBatch(DEV_ID, bytes32(0), 0, 7, 8);

        // Unregistered device
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(BatchAnchor.DeviceNotActive.selector, DEV_ID));
        anchor.anchorBatch(DEV_ID, SAMPLE_ROOT, 0, 7, 8);

        // Register device without bond
        vm.prank(operator);
        registry.registerDevice(DEV_ID, INST_ID, operator, validPubKey);

        // Unauthorized caller
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(BatchAnchor.UnauthorizedCaller.selector, stranger));
        anchor.anchorBatch(DEV_ID, SAMPLE_ROOT, 0, 7, 8);

        // Insufficient operator bond
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(BatchAnchor.InsufficientOperatorBond.selector, INST_ID));
        anchor.anchorBatch(DEV_ID, SAMPLE_ROOT, 0, 7, 8);

        // Deposit bond
        vm.prank(operator);
        vault.depositOperatorBond{value: MIN_OP_BOND}(INST_ID);

        // Invalid sequence ranges
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(BatchAnchor.InvalidSequenceRange.selector, 0, 0, 7, 0));
        anchor.anchorBatch(DEV_ID, SAMPLE_ROOT, 0, 7, 0);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(BatchAnchor.InvalidSequenceRange.selector, 0, 1, 8, 8));
        anchor.anchorBatch(DEV_ID, SAMPLE_ROOT, 1, 8, 8);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(BatchAnchor.InvalidSequenceRange.selector, 0, 0, 7, 9));
        anchor.anchorBatch(DEV_ID, SAMPLE_ROOT, 0, 7, 9);

        // Anchor first valid batch (seq 0..7)
        vm.prank(operator);
        uint256 bId = anchor.anchorBatch(DEV_ID, SAMPLE_ROOT, 0, 7, 8);
        assertEq(bId, 1);

        // Overlapping next batch (tries firstSeq = 7 instead of 8)
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(BatchAnchor.InvalidSequenceRange.selector, 8, 7, 14, 8));
        anchor.anchorBatch(DEV_ID, SAMPLE_ROOT, 7, 14, 8);

        // BatchNotFound on getBatch / verifyPacketInclusion / updateBatchStatus
        vm.expectRevert(abi.encodeWithSelector(BatchAnchor.BatchNotFound.selector, 999));
        anchor.getBatch(999);

        bytes32[] memory emptyProof = new bytes32[](0);
        vm.expectRevert(abi.encodeWithSelector(BatchAnchor.BatchNotFound.selector, 999));
        anchor.verifyPacketInclusion(999, bytes32(uint256(1)), emptyProof);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(BatchAnchor.BatchNotFound.selector, 999));
        anchor.updateBatchStatus(999, BatchAnchor.BatchStatus.Verified);

        // Unauthorized status update
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(BatchAnchor.UnauthorizedCaller.selector, stranger));
        anchor.updateBatchStatus(1, BatchAnchor.BatchStatus.Verified);

        // Invalid status transitions
        vm.prank(address(quorum));
        vm.expectRevert(
            abi.encodeWithSelector(
                BatchAnchor.InvalidStatusTransition.selector,
                BatchAnchor.BatchStatus.Anchored,
                BatchAnchor.BatchStatus.Slashed
            )
        );
        anchor.updateBatchStatus(1, BatchAnchor.BatchStatus.Slashed);

        vm.prank(address(challenge));
        vm.expectRevert(
            abi.encodeWithSelector(
                BatchAnchor.InvalidStatusTransition.selector,
                BatchAnchor.BatchStatus.Anchored,
                BatchAnchor.BatchStatus.Slashed
            )
        );
        anchor.updateBatchStatus(1, BatchAnchor.BatchStatus.Slashed);

        // Pause / unpause
        vm.prank(admin);
        anchor.pause();
        vm.prank(admin);
        anchor.unpause();
    }

    function test_VerifierQuorum_RevertPaths() public {
        vm.expectRevert(VerifierQuorum.ZeroAddress.selector);
        new VerifierQuorum(address(0), vault, anchor, treasury, 5, 3, 30, 30, 1000);

        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.InvalidQuorumConfig.selector, 5, 6));
        new VerifierQuorum(admin, vault, anchor, treasury, 5, 6, 30, 30, 1000);

        // Max verifiers already registered (5)
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.MaxVerifiersReached.selector, 5));
        quorum.registerVerifier(stranger);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.VerifierAlreadyRegistered.selector, verifiers[0]));
        quorum.registerVerifier(verifiers[0]);

        vm.prank(admin);
        vm.expectRevert(VerifierQuorum.ZeroAddress.selector);
        quorum.registerVerifier(address(0));

        vm.prank(admin);
        vm.expectRevert(VerifierQuorum.ZeroAddress.selector);
        quorum.setChallengeContract(IChallenge(address(0)));

        // Prepare batch 1
        vm.startPrank(operator);
        registry.registerDevice(DEV_ID, INST_ID, operator, validPubKey);
        vault.depositOperatorBond{value: MIN_OP_BOND}(INST_ID);
        uint256 batchId = anchor.anchorBatch(DEV_ID, SAMPLE_ROOT, 0, 7, 8);
        vm.stopPrank();

        bytes32 salt = bytes32(uint256(42));
        bytes32 commitHash = quorum.computeCommitment(
            batchId,
            MODEL_HASH,
            SAMPLE_ROOT,
            100,
            VerifierQuorum.Verdict.Clean,
            salt
        );

        // Stranger not registered verifier
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.NotRegisteredVerifier.selector, stranger));
        quorum.commitVote(batchId, commitHash);

        // Zero commitment
        vm.prank(verifiers[0]);
        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.CommitmentMismatch.selector, bytes32(0), bytes32(0)));
        quorum.commitVote(batchId, bytes32(0));

        // Commit valid vote for verifier 0
        vm.prank(verifiers[0]);
        quorum.commitVote(batchId, commitHash);

        // AlreadyCommitted
        vm.prank(verifiers[0]);
        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.AlreadyCommitted.selector, batchId, verifiers[0]));
        quorum.commitVote(batchId, commitHash);

        // Reveal while commit window still open
        vm.prank(verifiers[0]);
        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.CommitWindowStillOpen.selector, batchId));
        quorum.revealVote(batchId, MODEL_HASH, SAMPLE_ROOT, 100, VerifierQuorum.Verdict.Clean, salt, "");

        // Move into reveal window
        vm.warp(block.timestamp + COMMIT_WINDOW + 1);

        // Commit after commit window closed
        vm.prank(verifiers[1]);
        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.CommitWindowClosed.selector, batchId));
        quorum.commitVote(batchId, commitHash);

        // Reveal by uncommitted verifier
        vm.prank(verifiers[1]);
        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.NotCommitted.selector, batchId, verifiers[1]));
        quorum.revealVote(batchId, MODEL_HASH, SAMPLE_ROOT, 100, VerifierQuorum.Verdict.Clean, salt, "");

        // InvalidScoreBp (> 10000)
        vm.prank(verifiers[0]);
        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.InvalidScoreBp.selector, 10001));
        quorum.revealVote(batchId, MODEL_HASH, SAMPLE_ROOT, 10001, VerifierQuorum.Verdict.Clean, salt, "");

        // InputHashMismatch
        vm.prank(verifiers[0]);
        vm.expectRevert(
            abi.encodeWithSelector(VerifierQuorum.InputHashMismatch.selector, SAMPLE_ROOT, bytes32(uint256(99)))
        );
        quorum.revealVote(batchId, MODEL_HASH, bytes32(uint256(99)), 100, VerifierQuorum.Verdict.Clean, salt, "");

        // CommitmentMismatch (wrong salt)
        bytes32 badActual = quorum.computeCommitment(
            batchId,
            MODEL_HASH,
            SAMPLE_ROOT,
            100,
            VerifierQuorum.Verdict.Clean,
            bytes32(uint256(999))
        );
        vm.prank(verifiers[0]);
        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.CommitmentMismatch.selector, commitHash, badActual));
        quorum.revealVote(
            batchId,
            MODEL_HASH,
            SAMPLE_ROOT,
            100,
            VerifierQuorum.Verdict.Clean,
            bytes32(uint256(999)),
            ""
        );

        // Valid reveal by verifier 0
        vm.prank(verifiers[0]);
        quorum.revealVote(batchId, MODEL_HASH, SAMPLE_ROOT, 100, VerifierQuorum.Verdict.Clean, salt, "");

        // AlreadyRevealed
        vm.prank(verifiers[0]);
        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.AlreadyRevealed.selector, batchId, verifiers[0]));
        quorum.revealVote(batchId, MODEL_HASH, SAMPLE_ROOT, 100, VerifierQuorum.Verdict.Clean, salt, "");

        // Finalize with only 1 vote -> QuorumNotReached
        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.QuorumNotReached.selector, batchId));
        quorum.finalize(batchId);

        // Move past reveal window -> RevealWindowClosed
        vm.warp(block.timestamp + REVEAL_WINDOW + 1);
        vm.prank(verifiers[0]);
        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.RevealWindowClosed.selector, batchId));
        quorum.revealVote(batchId, MODEL_HASH, SAMPLE_ROOT, 100, VerifierQuorum.Verdict.Clean, salt, "");

        assertEq(quorum.getRegisteredVerifiers().length, 5);
        vm.prank(admin);
        quorum.pause();
        vm.prank(admin);
        quorum.unpause();
    }

    function test_ChallengeAndAttestation_RevertPaths() public {
        vm.expectRevert(Challenge.ZeroAddress.selector);
        new Challenge(address(0), registry, vault, anchor, quorum, treasury, 120, 5000, 1000, 2);

        vm.expectRevert(Challenge.InvalidConfig.selector);
        new Challenge(admin, registry, vault, anchor, quorum, treasury, 0, 5000, 1000, 2);

        vm.expectRevert(Attestation.ZeroAddress.selector);
        new Attestation(address(0), registry, anchor);

        // Prepare batch 1 (Anchored, not Quarantined)
        vm.startPrank(operator);
        registry.registerDevice(DEV_ID, INST_ID, operator, validPubKey);
        vault.depositOperatorBond{value: MIN_OP_BOND}(INST_ID);
        uint256 batchId = anchor.anchorBatch(DEV_ID, SAMPLE_ROOT, 0, 7, 8);
        vm.stopPrank();

        // openChallenge unauthorized
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Challenge.UnauthorizedCaller.selector, stranger));
        challenge.openChallenge(batchId, bytes32(uint256(1)));

        // openChallenge zero evidence
        vm.prank(verifiers[0]);
        vm.expectRevert(Challenge.InvalidEvidenceHash.selector);
        challenge.openChallenge(batchId, bytes32(0));

        // openChallenge when batch is not Quarantined
        vm.prank(verifiers[0]);
        vm.expectRevert(abi.encodeWithSelector(Challenge.BatchNotQuarantined.selector, batchId));
        challenge.openChallenge(batchId, bytes32(uint256(1)));

        // ChallengeNotFound on getChallenge / resolve / settleExpired / submitOperatorDispute
        vm.expectRevert(abi.encodeWithSelector(Challenge.ChallengeNotFound.selector, 999));
        challenge.getChallenge(999);

        vm.prank(arbiters[0]);
        vm.expectRevert(abi.encodeWithSelector(Challenge.ChallengeNotFound.selector, 999));
        challenge.resolve(999, true, "none");

        vm.expectRevert(abi.encodeWithSelector(Challenge.ChallengeNotFound.selector, 999));
        challenge.settleExpired(999);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Challenge.ChallengeNotFound.selector, 999));
        challenge.submitOperatorDispute(999, bytes32(uint256(1)), "uri");

        // Attestation revert paths
        uint256[] memory emptyBatches = new uint256[](0);
        uint256[] memory batchList = new uint256[](1);
        batchList[0] = batchId;

        // Unauthorized caller
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Attestation.UnauthorizedCaller.selector, stranger));
        attestation.recordAttestation(INST_ID, "2026-Q3", 950_000, 500_000, 10000, SAMPLE_ROOT, batchList);

        // EmptyBatchList
        vm.prank(operator);
        vm.expectRevert(Attestation.EmptyBatchList.selector);
        attestation.recordAttestation(INST_ID, "2026-Q3", 950_000, 500_000, 10000, SAMPLE_ROOT, emptyBatches);

        // ZeroProductionMass
        vm.prank(operator);
        vm.expectRevert(Attestation.ZeroProductionMass.selector);
        attestation.recordAttestation(INST_ID, "2026-Q3", 950_000, 0, 10000, SAMPLE_ROOT, batchList);

        // InvalidCoverageBp
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Attestation.InvalidCoverageBp.selector, 10001));
        attestation.recordAttestation(INST_ID, "2026-Q3", 950_000, 500_000, 10001, SAMPLE_ROOT, batchList);

        // EmptyPeriodMerkleRoot
        vm.prank(operator);
        vm.expectRevert(Attestation.EmptyPeriodMerkleRoot.selector);
        attestation.recordAttestation(INST_ID, "2026-Q3", 950_000, 500_000, 10000, bytes32(0), batchList);

        // InstallationMismatch
        bytes32 wrongInst = keccak256("WRONG-INST");
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(Attestation.InstallationMismatch.selector, batchId, wrongInst, INST_ID));
        attestation.recordAttestation(wrongInst, "2026-Q3", 950_000, 500_000, 10000, SAMPLE_ROOT, batchList);

        // BatchNotVerified (batch 1 is still Anchored)
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Attestation.BatchNotVerified.selector, batchId));
        attestation.recordAttestation(INST_ID, "2026-Q3", 950_000, 500_000, 10000, SAMPLE_ROOT, batchList);

        // AttestationNotFound
        vm.expectRevert(abi.encodeWithSelector(Attestation.AttestationNotFound.selector, 404));
        attestation.getAttestation(404);

        vm.expectRevert(abi.encodeWithSelector(Attestation.AttestationNotFound.selector, 404));
        attestation.getAttestationBatchIds(404);

        vm.prank(admin);
        challenge.pause();
        vm.prank(admin);
        challenge.unpause();
        vm.prank(admin);
        attestation.pause();
        vm.prank(admin);
        attestation.unpause();
    }

    // =========================================================================
    // 4. Scenario Tests (a) through (f)
    // =========================================================================

    /// @notice Scenario (a): Clean path from device registration -> bond deposit -> batch anchor ->
    ///         3-of-5 Clean quorum -> Verified status -> Period Attestation.
    function test_ScenarioA_CleanPathToAttestation() public {
        vm.startPrank(operator);
        registry.registerDevice(DEV_ID, INST_ID, operator, validPubKey);
        vault.depositOperatorBond{value: MIN_OP_BOND}(INST_ID);
        uint256 batchId = anchor.anchorBatch(DEV_ID, SAMPLE_ROOT, 0, 7, 8);
        vm.stopPrank();

        _voteAndFinalize(batchId, SAMPLE_ROOT, VerifierQuorum.Verdict.Clean, 120, 5);

        BatchAnchor.BatchRecord memory b = anchor.getBatch(batchId);
        assertEq(uint8(b.status), uint8(BatchAnchor.BatchStatus.Verified));

        // Finalize a second time must revert
        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.BatchAlreadyFinalized.selector, batchId));
        quorum.finalize(batchId);

        uint256[] memory verifiedIds = new uint256[](1);
        verifiedIds[0] = batchId;

        vm.prank(operator);
        uint256 attId = attestation.recordAttestation(
            INST_ID,
            "2026-Q3",
            950_000,
            500_000,
            10_000,
            SAMPLE_ROOT,
            verifiedIds
        );

        Attestation.PeriodAttestation memory att = attestation.getAttestation(attId);
        assertEq(att.attestationId, 1);
        assertEq(att.installationId, INST_ID);
        assertEq(att.totalEmissionsKgCo2e, 950_000);
        assertEq(att.productionKg, 500_000);
        assertEq(att.coverageBp, 10_000);
        assertEq(att.periodMerkleRoot, SAMPLE_ROOT);
        assertEq(attestation.getAttestationBatchIds(attId).length, 1);
    }

    /// @notice Scenario (b): Fraud path -> 3-of-5 verifiers flag Fraud -> challenge opened -> operator disputes ->
    ///         2-of-3 arbiter council upholds fraud -> 50% of operator bond slashed (70% to flagging verifiers, 30% to treasury).
    function test_ScenarioB_FraudFlaggedUpheldAndSlashed() public {
        vm.startPrank(operator);
        registry.registerDevice(DEV_ID, INST_ID, operator, validPubKey);
        vault.depositOperatorBond{value: MIN_OP_BOND}(INST_ID);
        uint256 batchId = anchor.anchorBatch(DEV_ID, SAMPLE_ROOT, 0, 7, 8);
        vm.stopPrank();

        // 4 verifiers vote Fraud, 1 votes Clean
        for (uint256 i = 0; i < 5; ++i) {
            VerifierQuorum.Verdict v = i < 4 ? VerifierQuorum.Verdict.Fraud : VerifierQuorum.Verdict.Clean;
            uint16 score = i < 4 ? 9450 : 1200;
            bytes32 cHash = quorum.computeCommitment(batchId, MODEL_HASH, SAMPLE_ROOT, score, v, bytes32(i + 1));
            vm.prank(verifiers[i]);
            quorum.commitVote(batchId, cHash);
        }

        vm.warp(block.timestamp + COMMIT_WINDOW + 1);
        for (uint256 i = 0; i < 5; ++i) {
            VerifierQuorum.Verdict v = i < 4 ? VerifierQuorum.Verdict.Fraud : VerifierQuorum.Verdict.Clean;
            uint16 score = i < 4 ? 9450 : 1200;
            vm.prank(verifiers[i]);
            quorum.revealVote(batchId, MODEL_HASH, SAMPLE_ROOT, score, v, bytes32(i + 1), "PHYSICS_RESIDUAL");
        }

        quorum.finalize(batchId);
        assertEq(uint8(anchor.getBatch(batchId).status), uint8(BatchAnchor.BatchStatus.Quarantined));

        Challenge.ChallengeRecord memory cRec = challenge.getChallenge(batchId);
        assertEq(uint8(cRec.status), uint8(Challenge.ChallengeStatus.Open));

        // Operator submits dispute
        vm.prank(operator);
        challenge.submitOperatorDispute(batchId, keccak256("counter-evidence"), "ipfs://dispute-1");
        assertEq(
            uint8(challenge.getChallenge(batchId).status),
            uint8(Challenge.ChallengeStatus.DisputedByOperator)
        );

        // Duplicate dispute reverts
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Challenge.OperatorAlreadyDisputed.selector, batchId));
        challenge.submitOperatorDispute(batchId, keccak256("counter-evidence-2"), "ipfs://dispute-2");

        // settleExpired cannot be called when operator disputed
        vm.warp(block.timestamp + CHALLENGE_WINDOW + 1);
        vm.expectRevert(abi.encodeWithSelector(Challenge.OperatorAlreadyDisputed.selector, batchId));
        challenge.settleExpired(batchId);

        // Arbiter 0 votes to uphold (1 of 2 required -> not settled yet)
        vm.prank(arbiters[0]);
        challenge.resolve(batchId, true, "Mass balance residual confirmed");
        assertEq(
            uint8(challenge.getChallenge(batchId).status),
            uint8(Challenge.ChallengeStatus.DisputedByOperator)
        );

        // Arbiter 0 cannot vote twice
        vm.prank(arbiters[0]);
        vm.expectRevert(abi.encodeWithSelector(Challenge.ArbiterAlreadyVoted.selector, batchId, arbiters[0]));
        challenge.resolve(batchId, true, "duplicate");

        // Arbiter 1 votes to uphold (2 of 3 council reached -> settled!)
        vm.prank(arbiters[1]);
        challenge.resolve(batchId, true, "Second arbiter confirms fraud");

        assertEq(uint8(challenge.getChallenge(batchId).status), uint8(Challenge.ChallengeStatus.UpheldSlashed));
        assertEq(uint8(anchor.getBatch(batchId).status), uint8(BatchAnchor.BatchStatus.Slashed));

        // Operator bond slashed by 50% (0.5 ETH): 70% (0.35 ETH) split among 4 flagging verifiers (0.0875 ETH each), 30% (0.15 ETH) to treasury
        assertEq(vault.operatorBondOf(INST_ID), 0.5 ether);
        uint256 expectedPerVerifier = (0.5 ether * 7000) / 10000 / 4; // 0.0875 ether
        for (uint256 i = 0; i < 4; ++i) {
            assertEq(vault.claimableRewards(verifiers[i]), expectedPerVerifier);
            uint256 beforeBal = verifiers[i].balance;
            vm.prank(verifiers[i]);
            vault.claimRewards();
            assertEq(verifiers[i].balance, beforeBal + expectedPerVerifier);
        }
        assertEq(vault.claimableRewards(treasury), 0.15 ether);
        uint256 trBefore = treasury.balance;
        vm.prank(treasury);
        vault.claimRewards();
        assertEq(treasury.balance, trBefore + 0.15 ether);
    }

    /// @notice Scenario (c): Overturned path -> batch flagged -> operator disputes with valid Merkle inclusion proof ->
    ///         2-of-3 arbiter council overturns flag -> batch Cleared -> flagging verifiers lose 10% stake to operator.
    function test_ScenarioC_OverturnedPathWithMerkleProof() public {
        // Construct a 2-leaf Merkle tree for the batch
        bytes32 pHash0 = 0x60537e1310a29ced857be5d287d2158ebcca0a695d8bc72317591a5404f0176b;
        bytes32 pHash1 = 0xbcbe7ade68569608a3f683033867ddfb734964578efd616947a21e2c951207eb;
        bytes32 leaf0 = keccak256(abi.encodePacked(pHash0));
        bytes32 leaf1 = keccak256(abi.encodePacked(pHash1));
        bytes32 root = leaf0 <= leaf1
            ? keccak256(abi.encodePacked(leaf0, leaf1))
            : keccak256(abi.encodePacked(leaf1, leaf0));

        vm.startPrank(operator);
        registry.registerDevice(DEV_ID, INST_ID, operator, validPubKey);
        vault.depositOperatorBond{value: MIN_OP_BOND}(INST_ID);
        uint256 batchId = anchor.anchorBatch(DEV_ID, root, 0, 1, 2);
        vm.stopPrank();

        _voteAndFinalize(batchId, root, VerifierQuorum.Verdict.Fraud, 6200, 3);
        assertEq(uint8(anchor.getBatch(batchId).status), uint8(BatchAnchor.BatchStatus.Quarantined));

        // Invalid Merkle proof reverts
        bytes32[] memory badProof = new bytes32[](1);
        badProof[0] = bytes32(uint256(12345));
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Challenge.InvalidMerkleProof.selector, batchId, pHash0));
        challenge.submitOperatorDispute(batchId, keccak256("proof-bundle"), pHash0, badProof, "ipfs://calibration-log");

        // Valid Merkle proof succeeds
        bytes32[] memory validProof = new bytes32[](1);
        validProof[0] = leaf1;
        vm.prank(operator);
        challenge.submitOperatorDispute(
            batchId,
            keccak256("proof-bundle"),
            pHash0,
            validProof,
            "ipfs://calibration-log"
        );

        // 2 of 3 arbiters vote to overturn (upholdFraudFlag = false)
        vm.prank(arbiters[0]);
        challenge.resolve(batchId, false, "Scheduled calibration event verified");
        vm.prank(arbiters[2]);
        challenge.resolve(batchId, false, "Confirmed calibration certificate");

        assertEq(uint8(challenge.getChallenge(batchId).status), uint8(Challenge.ChallengeStatus.OverturnedCleared));
        assertEq(uint8(anchor.getBatch(batchId).status), uint8(BatchAnchor.BatchStatus.Cleared));

        // Each of the 3 flagging verifiers lost 10% of 0.5 ETH = 0.05 ETH -> 0.15 ETH credited to operator
        uint256 expectedPenaltyPerVerifier = (MIN_VER_STAKE * CARELESS_SLASH_BPS) / 10000;
        for (uint256 i = 0; i < 3; ++i) {
            assertEq(vault.verifierStakeOf(verifiers[i]), MIN_VER_STAKE - expectedPenaltyPerVerifier);
        }
        assertEq(vault.claimableRewards(operator), expectedPenaltyPerVerifier * 3);

        uint256 opBefore = operator.balance;
        vm.prank(operator);
        vault.claimRewards();
        assertEq(operator.balance, opBefore + expectedPenaltyPerVerifier * 3);

        // Cleared batch is eligible for PeriodAttestation
        uint256[] memory verifiedIds = new uint256[](1);
        verifiedIds[0] = batchId;
        vm.prank(operator);
        uint256 attId = attestation.recordAttestation(INST_ID, "2026-Q3", 500_000, 250_000, 10_000, root, verifiedIds);
        assertEq(attId, 1);
    }

    /// @notice Scenario (d): Operator tries to withdraw bond during an open challenge (both new request and pre-existing matured request blocked).
    function test_ScenarioD_OperatorCannotWithdrawDuringChallenge() public {
        vm.startPrank(operator);
        registry.registerDevice(DEV_ID, INST_ID, operator, validPubKey);
        vault.depositOperatorBond{value: 2 ether}(INST_ID);
        // Request a withdrawal BEFORE the challenge opens
        vault.requestOperatorWithdraw(INST_ID, 0.5 ether);
        uint256 batchId = anchor.anchorBatch(DEV_ID, SAMPLE_ROOT, 0, 7, 8);
        vm.stopPrank();

        _voteAndFinalize(batchId, SAMPLE_ROOT, VerifierQuorum.Verdict.Fraud, 8800, 3);

        // Warp past withdrawal delay while challenge is still open
        vm.warp(block.timestamp + WITHDRAW_DELAY + 1);

        // Attempting to execute the pre-existing withdrawal during open challenge reverts!
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(BondVault.ActiveChallengeBlocksWithdrawal.selector, INST_ID));
        vault.executeOperatorWithdraw(INST_ID);

        // Attempting to request a new withdrawal during open challenge also reverts!
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(BondVault.ActiveChallengeBlocksWithdrawal.selector, INST_ID));
        vault.requestOperatorWithdraw(INST_ID, 0.2 ether);

        // Settle the expired challenge (since window 120s < WITHDRAW_DELAY 180s has now elapsed without dispute)
        challenge.settleExpired(batchId);
        assertEq(uint8(challenge.getChallenge(batchId).status), uint8(Challenge.ChallengeStatus.ExpiredSlashed));

        // Now challenge lock is released and operator can execute the withdrawal from remaining bond (1.0 ETH remaining >= 0.5 ETH pending)
        vm.prank(operator);
        vault.executeOperatorWithdraw(INST_ID);
        assertEq(vault.operatorBondOf(INST_ID), 0.5 ether);
    }

    /// @notice Scenario (e): Revoked device tries to anchor a batch and is rejected.
    function test_ScenarioE_RevokedDeviceCannotAnchor() public {
        vm.startPrank(operator);
        registry.registerDevice(DEV_ID, INST_ID, operator, validPubKey);
        vault.depositOperatorBond{value: MIN_OP_BOND}(INST_ID);
        anchor.anchorBatch(DEV_ID, SAMPLE_ROOT, 0, 7, 8);

        registry.revokeDevice(DEV_ID, "Key compromise suspected");

        vm.expectRevert(abi.encodeWithSelector(BatchAnchor.DeviceNotActive.selector, DEV_ID));
        anchor.anchorBatch(DEV_ID, SAMPLE_ROOT, 8, 15, 8);
        vm.stopPrank();
    }

    /// @notice Scenario (f): Verifier commits a vote but fails to reveal before the reveal window expires -> penalized on finalize().
    function test_ScenarioF_VerifierFailsToRevealPenalized() public {
        vm.startPrank(operator);
        registry.registerDevice(DEV_ID, INST_ID, operator, validPubKey);
        vault.depositOperatorBond{value: MIN_OP_BOND}(INST_ID);
        uint256 batchId = anchor.anchorBatch(DEV_ID, SAMPLE_ROOT, 0, 7, 8);
        vm.stopPrank();

        // All 5 verifiers commit Clean
        for (uint256 i = 0; i < 5; ++i) {
            bytes32 cHash = quorum.computeCommitment(
                batchId,
                MODEL_HASH,
                SAMPLE_ROOT,
                100,
                VerifierQuorum.Verdict.Clean,
                bytes32(i + 1)
            );
            vm.prank(verifiers[i]);
            quorum.commitVote(batchId, cHash);
        }

        // Move to reveal window: only verifiers 0..3 reveal; verifier 4 never reveals
        vm.warp(block.timestamp + COMMIT_WINDOW + 1);
        for (uint256 i = 0; i < 4; ++i) {
            vm.prank(verifiers[i]);
            quorum.revealVote(
                batchId,
                MODEL_HASH,
                SAMPLE_ROOT,
                100,
                VerifierQuorum.Verdict.Clean,
                bytes32(i + 1),
                ""
            );
        }

        // Move past reveal window and finalize
        vm.warp(block.timestamp + REVEAL_WINDOW + 1);
        quorum.finalize(batchId);

        uint256 expectedPenalty = (MIN_VER_STAKE * UNREVEALED_PENALTY_BPS) / 10000;
        assertEq(vault.verifierStakeOf(verifiers[4]), MIN_VER_STAKE - expectedPenalty);
        assertEq(vault.claimableRewards(treasury), expectedPenalty);
        assertTrue(quorum.unrevealedPenalized(batchId, verifiers[4]));
    }

    /// @notice Verifies that Deploy.s.sol parses both "demo" and "real" profiles from ../config/params.yaml accurately.
    function test_DeployScript_LoadsDemoAndRealProfiles() public {
        Deploy deployer = new Deploy();

        Deploy.ProfileParams memory demoParams = deployer.loadParamsFromYaml("../config/params.yaml", "demo");
        assertEq(demoParams.verifierCount, 5);
        assertEq(demoParams.requiredMatches, 3);
        assertEq(demoParams.minOperatorBondWei, 1 ether);
        assertEq(demoParams.minVerifierStakeWei, 0.5 ether);
        assertEq(demoParams.operatorSlashBps, 5000);
        assertEq(demoParams.verifierRewardShareBps, 7000);
        assertEq(demoParams.carelessVerifierSlashBps, 1000);
        assertEq(demoParams.commitWindowSeconds, 30);
        assertEq(demoParams.revealWindowSeconds, 30);
        assertEq(demoParams.challengeWindowSeconds, 120);
        assertEq(demoParams.withdrawalDelaySeconds, 180);

        Deploy.ProfileParams memory realParams = deployer.loadParamsFromYaml("../config/params.yaml", "real");
        assertEq(realParams.commitWindowSeconds, 900);
        assertEq(realParams.revealWindowSeconds, 900);
        assertEq(realParams.challengeWindowSeconds, 86400);
        assertEq(realParams.withdrawalDelaySeconds, 604800);

        Deploy.ProfileParams memory testnetParams = deployer.loadParamsFromYaml("../config/params.yaml", "testnet");
        assertEq(testnetParams.minOperatorBondWei, 0.001 ether);
        assertEq(testnetParams.minVerifierStakeWei, 0.0005 ether);
        assertEq(testnetParams.commitWindowSeconds, 20);
        assertEq(testnetParams.revealWindowSeconds, 20);
        assertEq(testnetParams.challengeWindowSeconds, 60);
        assertEq(testnetParams.withdrawalDelaySeconds, 60);

        Deploy.DeployedContracts memory d = deployer.deployAll(admin, treasury, verifiers, arbiters, demoParams);
        assertTrue(address(d.deviceRegistry) != address(0));
        assertTrue(address(d.bondVault) != address(0));
        assertTrue(address(d.batchAnchor) != address(0));
        assertTrue(address(d.verifierQuorum) != address(0));
        assertTrue(address(d.challenge) != address(0));
        assertTrue(address(d.attestation) != address(0));

        // Also test deployer.run() end-to-end
        deployer.run();
    }

    function test_AdditionalRevertEdgesForFullLineCoverage() public {
        // 1. BondVault additional slash / withdrawal revert edges
        vm.prank(operator);
        vault.depositOperatorBond{value: 1 ether}(INST_ID);

        address[] memory badVerifiers = new address[](1);
        badVerifiers[0] = address(0);

        vm.startPrank(admin);
        vault.grantRole(vault.CHALLENGE_CONTRACT_ROLE(), admin);

        vm.expectRevert(BondVault.ZeroAddress.selector);
        vault.slashOperator(INST_ID, 0.5 ether, badVerifiers, address(0));

        vm.expectRevert(abi.encodeWithSelector(BondVault.InsufficientBondBalance.selector, 1 ether, 2 ether));
        vault.slashOperator(INST_ID, 2 ether, badVerifiers, treasury);

        vm.expectRevert(BondVault.ZeroAddress.selector);
        vault.slashOperator(INST_ID, 0.5 ether, badVerifiers, treasury);

        vm.expectRevert(BondVault.ZeroAddress.selector);
        vault.slashVerifier(address(0), 0.1 ether, treasury);

        vm.expectRevert(
            abi.encodeWithSelector(BondVault.InsufficientBondBalance.selector, MIN_VER_STAKE, 5 ether)
        );
        vault.slashVerifier(verifiers[0], 5 ether, treasury);
        vm.stopPrank();

        // Clamp pending verifier withdrawal upon slashVerifier
        vm.prank(verifiers[0]);
        vault.requestVerifierWithdraw(MIN_VER_STAKE);

        vm.prank(admin);
        vault.slashVerifier(verifiers[0], 0.2 ether, treasury);

        // Now verifiers[0] has stake < MIN_VER_STAKE (0.3 ether)
        vm.startPrank(operator);
        registry.registerDevice(DEV_ID, INST_ID, operator, validPubKey);
        uint256 bId = anchor.anchorBatch(DEV_ID, SAMPLE_ROOT, 0, 7, 8);
        vm.stopPrank();

        bytes32 cHash0 = quorum.computeCommitment(
            bId,
            MODEL_HASH,
            SAMPLE_ROOT,
            100,
            VerifierQuorum.Verdict.Clean,
            bytes32(uint256(1))
        );

        // InsufficientVerifierStake on commitVote
        vm.prank(verifiers[0]);
        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.InsufficientVerifierStake.selector, verifiers[0]));
        quorum.commitVote(bId, cHash0);

        // Restore stake for verifiers[0], commit, then slash before reveal to trigger InsufficientVerifierStake on revealVote
        vm.prank(verifiers[0]);
        vault.depositVerifierStake{value: 0.2 ether}();
        vm.prank(verifiers[0]);
        quorum.commitVote(bId, cHash0);

        // Verifiers 1..3 also commit Fraud
        for (uint256 i = 1; i <= 3; ++i) {
            bytes32 cHash = quorum.computeCommitment(
                bId,
                MODEL_HASH,
                SAMPLE_ROOT,
                9000,
                VerifierQuorum.Verdict.Fraud,
                bytes32(i + 10)
            );
            vm.prank(verifiers[i]);
            quorum.commitVote(bId, cHash);
        }

        vm.warp(block.timestamp + COMMIT_WINDOW + 1);

        // Slash verifiers[0] again before reveal
        vm.prank(admin);
        vault.slashVerifier(verifiers[0], 0.2 ether, treasury);

        vm.prank(verifiers[0]);
        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.InsufficientVerifierStake.selector, verifiers[0]));
        quorum.revealVote(bId, MODEL_HASH, SAMPLE_ROOT, 100, VerifierQuorum.Verdict.Clean, bytes32(uint256(1)), "");

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.NotRegisteredVerifier.selector, stranger));
        quorum.revealVote(bId, MODEL_HASH, SAMPLE_ROOT, 100, VerifierQuorum.Verdict.Clean, bytes32(uint256(1)), "");

        // Verifiers 1..3 reveal Fraud and finalize
        for (uint256 i = 1; i <= 3; ++i) {
            vm.prank(verifiers[i]);
            quorum.revealVote(
                bId,
                MODEL_HASH,
                SAMPLE_ROOT,
                9000,
                VerifierQuorum.Verdict.Fraud,
                bytes32(i + 10),
                "CHAIN_BREAK"
            );
        }
        quorum.finalize(bId);

        // Commit / reveal after batch already finalized
        vm.prank(verifiers[4]);
        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.BatchAlreadyFinalized.selector, bId));
        quorum.commitVote(bId, cHash0);

        vm.prank(verifiers[4]);
        vm.expectRevert(abi.encodeWithSelector(VerifierQuorum.BatchAlreadyFinalized.selector, bId));
        quorum.revealVote(bId, MODEL_HASH, SAMPLE_ROOT, 100, VerifierQuorum.Verdict.Clean, bytes32(uint256(1)), "");

        // Challenge additional revert paths on batch bId (which now has an Open challenge)
        vm.prank(verifiers[1]);
        vm.expectRevert(abi.encodeWithSelector(Challenge.ChallengeAlreadyExists.selector, bId));
        challenge.openChallenge(bId, bytes32(uint256(123)));

        vm.prank(operator);
        vm.expectRevert(Challenge.InvalidEvidenceHash.selector);
        challenge.submitOperatorDispute(bId, bytes32(0), "uri");

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Challenge.UnauthorizedCaller.selector, stranger));
        challenge.submitOperatorDispute(bId, bytes32(uint256(123)), "uri");

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Challenge.UnauthorizedCaller.selector, stranger));
        challenge.resolve(bId, true, "not arbiter");

        uint64 closesAt = challenge.getChallenge(bId).windowClosesAt;
        vm.expectRevert(abi.encodeWithSelector(Challenge.ChallengeWindowStillOpen.selector, bId, closesAt));
        challenge.settleExpired(bId);

        // Expire challenge window
        vm.warp(closesAt + 1);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Challenge.ChallengeWindowExpired.selector, bId, closesAt));
        challenge.submitOperatorDispute(bId, bytes32(uint256(123)), "too late");

        // Settle expired
        challenge.settleExpired(bId);

        // Post-settlement reverts
        vm.expectRevert(abi.encodeWithSelector(Challenge.ChallengeAlreadySettled.selector, bId));
        challenge.settleExpired(bId);

        vm.prank(arbiters[0]);
        vm.expectRevert(abi.encodeWithSelector(Challenge.ChallengeAlreadySettled.selector, bId));
        challenge.resolve(bId, true, "already settled");

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Challenge.ChallengeAlreadySettled.selector, bId));
        challenge.submitOperatorDispute(bId, bytes32(uint256(123)), "already settled");
    }

    function _voteAndFinalize(
        uint256 batchId,
        bytes32 merkleRoot,
        VerifierQuorum.Verdict verdict,
        uint16 scoreBp,
        uint256 numVoters
    ) internal {
        for (uint256 i = 0; i < numVoters; ++i) {
            bytes32 cHash = quorum.computeCommitment(
                batchId,
                MODEL_HASH,
                merkleRoot,
                scoreBp,
                verdict,
                bytes32(i + 100)
            );
            vm.prank(verifiers[i]);
            quorum.commitVote(batchId, cHash);
        }
        vm.warp(block.timestamp + COMMIT_WINDOW + 1);
        for (uint256 i = 0; i < numVoters; ++i) {
            vm.prank(verifiers[i]);
            quorum.revealVote(
                batchId,
                MODEL_HASH,
                merkleRoot,
                scoreBp,
                verdict,
                bytes32(i + 100),
                verdict == VerifierQuorum.Verdict.Fraud ? "CHAIN_BREAK" : ""
            );
        }
        quorum.finalize(batchId);
    }
}
