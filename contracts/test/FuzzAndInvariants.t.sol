// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {DeviceRegistry} from "../src/DeviceRegistry.sol";
import {BondVault} from "../src/BondVault.sol";
import {BatchAnchor} from "../src/BatchAnchor.sol";
import {VerifierQuorum, IChallenge} from "../src/VerifierQuorum.sol";
import {Challenge} from "../src/Challenge.sol";
import {Attestation} from "../src/Attestation.sol";

/// @title ProtocolHandler
/// @notice Stateful invariant testing handler exercising deposits, withdrawals, device lifecycle,
///         batch anchoring, commit-reveal voting, finalization, challenges, and reward claims.
contract ProtocolHandler is Test {
    DeviceRegistry public immutable registry;
    BondVault public immutable vault;
    BatchAnchor public immutable anchor;
    VerifierQuorum public immutable quorum;
    Challenge public immutable challenge;

    address public immutable admin;
    address public immutable treasury;
    address public immutable operator;
    address[] public verifiers;
    address[] public arbiters;

    bytes32 public constant INST_ID = keccak256("INST-INVARIANT-01");
    bytes32 public constant DEV_ID_1 = keccak256("DEV-INVARIANT-01");
    bytes32 public constant DEV_ID_2 = keccak256("DEV-INVARIANT-02");
    bytes32 public constant MODEL_HASH = keccak256("MODEL-V1");

    bytes internal validKey =
        hex"04758440df308461b9cc4dccfbca96be10ca28c8f3f6944c90da43de58f05b38db46383a9f357bf06d9cb74b2686822dd580150e5b16b8b6536949595ddff0ca21";

    mapping(uint256 => uint256) public finalizeSuccessCount;
    mapping(bytes32 => uint256[]) private _deviceBatches;
    uint256[] public anchoredBatchIds;

    constructor(
        DeviceRegistry _registry,
        BondVault _vault,
        BatchAnchor _anchor,
        VerifierQuorum _quorum,
        Challenge _challenge,
        address _admin,
        address _treasury,
        address _operator,
        address[] memory _verifiers,
        address[] memory _arbiters
    ) {
        registry = _registry;
        vault = _vault;
        anchor = _anchor;
        quorum = _quorum;
        challenge = _challenge;
        admin = _admin;
        treasury = _treasury;
        operator = _operator;
        verifiers = _verifiers;
        arbiters = _arbiters;
    }

    function actionDepositOperatorBond(uint96 rawAmount) external {
        uint256 amount = bound(uint256(rawAmount), 0.1 ether, 25 ether);
        vm.deal(operator, operator.balance + amount);
        vm.prank(operator);
        vault.depositOperatorBond{value: amount}(INST_ID);
    }

    function actionDepositVerifierStake(uint8 verifierIdx, uint96 rawAmount) external {
        address v = verifiers[verifierIdx % verifiers.length];
        uint256 amount = bound(uint256(rawAmount), 0.1 ether, 10 ether);
        vm.deal(v, v.balance + amount);
        vm.prank(v);
        vault.depositVerifierStake{value: amount}();
    }

    function actionRegisterDevices() external {
        if (registry.getDevice(DEV_ID_1).status == DeviceRegistry.DeviceStatus.Unregistered) {
            vm.prank(operator);
            registry.registerDevice(DEV_ID_1, INST_ID, operator, validKey);
        }
        if (registry.getDevice(DEV_ID_2).status == DeviceRegistry.DeviceStatus.Unregistered) {
            vm.prank(operator);
            registry.registerDevice(DEV_ID_2, INST_ID, operator, validKey);
        }
    }

    function actionRevokeDevice2() external {
        if (registry.isDeviceActive(DEV_ID_2)) {
            vm.prank(operator);
            registry.revokeDevice(DEV_ID_2, "Scheduled sensor replacement");
        }
    }

    function actionAnchorBatch(bool useSecondDevice, uint16 rawCount, bytes32 rootSeed) external {
        bytes32 devId = useSecondDevice ? DEV_ID_2 : DEV_ID_1;
        uint32 count = uint32(bound(uint256(rawCount), 1, 240));
        bytes32 root = rootSeed == bytes32(0) ? keccak256("fallback-root") : rootSeed;

        uint64 firstSeq = anchor.expectedFirstSeq(devId);
        uint64 lastSeq = firstSeq + uint64(count) - 1;

        bool wasActive = registry.isDeviceActive(devId);
        bool hadBond = vault.hasSufficientOperatorBond(INST_ID);

        vm.prank(operator);
        try anchor.anchorBatch(devId, root, firstSeq, lastSeq, count) returns (uint256 bId) {
            // Must only succeed if device was active and bond was sufficient
            assertTrue(wasActive, "Anchored with inactive device");
            assertTrue(hadBond, "Anchored with insufficient bond");
            _deviceBatches[devId].push(bId);
            anchoredBatchIds.push(bId);
        } catch {
            // Reverted as expected when device inactive or bond insufficient
        }
    }

    function actionVoteAndFinalize(uint256 batchSeed, bool voteFraud) external {
        if (anchoredBatchIds.length == 0) return;
        uint256 batchId = anchoredBatchIds[batchSeed % anchoredBatchIds.length];
        if (quorum.batchFinalized(batchId)) {
            // Attempting to finalize again must always revert
            vm.expectRevert();
            quorum.finalize(batchId);
            return;
        }

        BatchAnchor.BatchRecord memory b = anchor.getBatch(batchId);
        VerifierQuorum.Verdict verdict = voteFraud
            ? VerifierQuorum.Verdict.Fraud
            : VerifierQuorum.Verdict.Clean;
        uint16 score = voteFraud ? 8500 : 250;

        // Ensure we are inside commit window (or warp to batch anchoredAt)
        if (block.timestamp > b.anchoredAt + quorum.commitWindowSeconds()) {
            return;
        }

        for (uint256 i = 0; i < 4; ++i) {
            address v = verifiers[i];
            if (quorum.commitments(batchId, v) == bytes32(0) && vault.hasSufficientVerifierStake(v)) {
                bytes32 cHash = quorum.computeCommitment(
                    batchId,
                    MODEL_HASH,
                    b.merkleRoot,
                    score,
                    verdict,
                    bytes32(i + 1)
                );
                vm.prank(v);
                quorum.commitVote(batchId, cHash);
            }
        }

        vm.warp(b.anchoredAt + quorum.commitWindowSeconds() + 1);
        for (uint256 i = 0; i < 4; ++i) {
            address v = verifiers[i];
            if (
                quorum.commitments(batchId, v) != bytes32(0) &&
                !quorum.getVote(batchId, v).revealed &&
                vault.hasSufficientVerifierStake(v)
            ) {
                vm.prank(v);
                quorum.revealVote(batchId, MODEL_HASH, b.merkleRoot, score, verdict, bytes32(i + 1), "");
            }
        }

        try quorum.finalize(batchId) {
            finalizeSuccessCount[batchId] += 1;
        } catch {}
    }

    function actionResolveChallenge(uint256 batchSeed, bool uphold) external {
        if (anchoredBatchIds.length == 0) return;
        uint256 batchId = anchoredBatchIds[batchSeed % anchoredBatchIds.length];

        try challenge.getChallenge(batchId) returns (Challenge.ChallengeRecord memory c) {
            if (
                c.status != Challenge.ChallengeStatus.Open &&
                c.status != Challenge.ChallengeStatus.DisputedByOperator
            ) {
                return;
            }
            vm.prank(arbiters[0]);
            try challenge.resolve(batchId, uphold, "arbiter-0") {} catch {}
            vm.prank(arbiters[1]);
            try challenge.resolve(batchId, uphold, "arbiter-1") {} catch {}
        } catch {}
    }

    function actionRequestAndExecuteOperatorWithdraw(uint96 rawAmount) external {
        uint256 bond = vault.operatorBondOf(INST_ID);
        if (bond == 0 || vault.activeChallengesCount(INST_ID) > 0) return;
        uint256 amount = bound(uint256(rawAmount), 1, bond);

        vm.prank(operator);
        try vault.requestOperatorWithdraw(INST_ID, amount) {
            vm.warp(block.timestamp + vault.withdrawalDelaySeconds() + 1);
            vm.prank(operator);
            try vault.executeOperatorWithdraw(INST_ID) {} catch {}
        } catch {}
    }

    function actionClaimRewards(uint8 actorIdx) external {
        address actor;
        uint8 sel = actorIdx % 7;
        if (sel < 5) actor = verifiers[sel];
        else if (sel == 5) actor = operator;
        else actor = treasury;

        if (vault.claimableRewards(actor) > 0) {
            vm.prank(actor);
            vault.claimRewards();
        }
    }

    function getDeviceBatches(bytes32 devId) external view returns (uint256[] memory) {
        return _deviceBatches[devId];
    }

    function getAnchoredBatchIds() external view returns (uint256[] memory) {
        return anchoredBatchIds;
    }
}

/// @title FuzzAndInvariantsTest
/// @notice Property-based fuzz tests and stateful protocol invariant tests.
contract FuzzAndInvariantsTest is StdInvariant, Test {
    DeviceRegistry internal registry;
    BondVault internal vault;
    BatchAnchor internal anchor;
    VerifierQuorum internal quorum;
    Challenge internal challenge;
    Attestation internal attestation;
    ProtocolHandler internal handler;

    address internal admin = makeAddr("inv_admin");
    address internal treasury = makeAddr("inv_treasury");
    address internal operator = makeAddr("inv_operator");
    address[] internal verifiers;
    address[] internal arbiters;

    bytes32 internal constant INST_ID = keccak256("INST-INVARIANT-01");
    bytes32 internal constant DEV_ID_1 = keccak256("DEV-INVARIANT-01");
    bytes32 internal constant DEV_ID_2 = keccak256("DEV-INVARIANT-02");

    bytes internal validKey =
        hex"04758440df308461b9cc4dccfbca96be10ca28c8f3f6944c90da43de58f05b38db46383a9f357bf06d9cb74b2686822dd580150e5b16b8b6536949595ddff0ca21";

    function setUp() public {
        vm.warp(1_700_000_000);

        for (uint256 i = 0; i < 5; ++i) {
            address v = makeAddr(string(abi.encodePacked("inv_verifier_", vm.toString(i))));
            verifiers.push(v);
            vm.deal(v, 5 ether);
        }
        for (uint256 i = 0; i < 3; ++i) {
            arbiters.push(makeAddr(string(abi.encodePacked("inv_arbiter_", vm.toString(i)))));
        }
        vm.deal(operator, 20 ether);

        vm.startPrank(admin);
        registry = new DeviceRegistry(admin);
        vault = new BondVault(admin, registry, 1 ether, 0.5 ether, 180, 7000);
        anchor = new BatchAnchor(admin, registry, vault);
        quorum = new VerifierQuorum(admin, vault, anchor, treasury, 5, 3, 30, 30, 1000);
        challenge = new Challenge(admin, registry, vault, anchor, quorum, treasury, 120, 5000, 1000, 2);
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

        // Initial setup so invariant handler can immediately exercise anchoring and voting
        vm.startPrank(operator);
        registry.registerDevice(DEV_ID_1, INST_ID, operator, validKey);
        vault.depositOperatorBond{value: 5 ether}(INST_ID);
        vm.stopPrank();

        for (uint256 i = 0; i < 5; ++i) {
            vm.prank(verifiers[i]);
            vault.depositVerifierStake{value: 1 ether}();
        }

        handler = new ProtocolHandler(
            registry,
            vault,
            anchor,
            quorum,
            challenge,
            admin,
            treasury,
            operator,
            verifiers,
            arbiters
        );

        targetContract(address(handler));
    }

    // =========================================================================
    // Fuzz Tests
    // =========================================================================

    /// @notice Fuzzes operator bond deposit, slash amount, and verifier reward splitting to verify zero wei leakage.
    function testFuzz_BondSlashAndRewardConservation(
        uint96 depositRaw,
        uint16 slashBpsRaw,
        uint8 honestCountRaw
    ) public {
        uint256 depositAmt = bound(uint256(depositRaw), 1 ether, 1_000 ether);
        uint16 slashBps = uint16(bound(uint256(slashBpsRaw), 0, 10_000));
        uint256 honestCount = bound(uint256(honestCountRaw), 1, 5);

        bytes32 fuzzInst = keccak256(abi.encodePacked("FUZZ-INST", depositRaw, slashBpsRaw));
        vm.deal(operator, depositAmt);
        vm.prank(operator);
        vault.depositOperatorBond{value: depositAmt}(fuzzInst);

        uint256 slashAmt = (depositAmt * slashBps) / 10_000;
        address[] memory honestList = new address[](honestCount);
        for (uint256 i = 0; i < honestCount; ++i) {
            honestList[i] = verifiers[i];
        }

        uint256 vaultBalBefore = address(vault).balance;

        vm.startPrank(admin);
        vault.grantRole(vault.CHALLENGE_CONTRACT_ROLE(), admin);
        vault.slashOperator(fuzzInst, slashAmt, honestList, treasury);
        vm.stopPrank();

        assertEq(address(vault).balance, vaultBalBefore);
        assertEq(vault.operatorBondOf(fuzzInst), depositAmt - slashAmt);
        assertLe(vault.cumulativeOperatorSlashed(fuzzInst), depositAmt);
        assertEq(
            address(vault).balance,
            vault.totalOperatorBonds() + vault.totalVerifierStakes() + vault.totalClaimableRewards()
        );
    }

    /// @notice Fuzzes contiguous sequence ranges across sequential batches and verifies non-contiguous ranges revert.
    function testFuzz_SequenceRangesContiguousAndNonOverlapping(
        uint16 count1Raw,
        uint16 count2Raw,
        uint16 count3Raw,
        uint64 badStartSeq
    ) public {
        uint32 c1 = uint32(bound(uint256(count1Raw), 1, 5000));
        uint32 c2 = uint32(bound(uint256(count2Raw), 1, 5000));
        uint32 c3 = uint32(bound(uint256(count3Raw), 1, 5000));

        vm.startPrank(operator);
        uint64 s1First = 0;
        uint64 s1Last = uint64(c1) - 1;
        uint256 b1 = anchor.anchorBatch(DEV_ID_1, keccak256("r1"), s1First, s1Last, c1);

        uint64 s2First = s1Last + 1;
        uint64 s2Last = s2First + uint64(c2) - 1;
        uint256 b2 = anchor.anchorBatch(DEV_ID_1, keccak256("r2"), s2First, s2Last, c2);

        uint64 expectedNext = s2Last + 1;
        if (badStartSeq != expectedNext) {
            uint64 badLast = badStartSeq > type(uint64).max - uint64(c3)
                ? type(uint64).max - 1
                : badStartSeq + uint64(c3) - 1;
            vm.expectRevert();
            anchor.anchorBatch(DEV_ID_1, keccak256("rBad"), badStartSeq, badLast, c3);
        }

        uint64 s3Last = expectedNext + uint64(c3) - 1;
        uint256 b3 = anchor.anchorBatch(DEV_ID_1, keccak256("r3"), expectedNext, s3Last, c3);
        vm.stopPrank();

        assertEq(anchor.getBatch(b1).lastSeq + 1, anchor.getBatch(b2).firstSeq);
        assertEq(anchor.getBatch(b2).lastSeq + 1, anchor.getBatch(b3).firstSeq);
    }

    // =========================================================================
    // Protocol Invariants
    // =========================================================================

    /// @notice Invariant 1: ETH held in BondVault equals the sum of recorded bonds, stakes, and claimable rewards (including treasury).
    function invariant_ethHeldEqualsRecordedBalances() public view {
        uint256 sumTrackedRewards = vault.claimableRewards(operator) + vault.claimableRewards(treasury);
        for (uint256 i = 0; i < verifiers.length; ++i) {
            sumTrackedRewards += vault.claimableRewards(verifiers[i]);
        }

        assertEq(sumTrackedRewards, vault.totalClaimableRewards(), "Tracked rewards mismatch");
        assertGe(vault.totalClaimableRewards(), vault.totalTreasuryBalances(), "Treasury exceeds claimable");
        assertEq(
            address(vault).balance,
            vault.totalOperatorBonds() + vault.totalVerifierStakes() + vault.totalClaimableRewards(),
            "ETH conservation violated"
        );
    }

    /// @notice Invariant 2: Cumulative slashed amount for an installation never exceeds total deposited bond.
    function invariant_slashedNeverExceedsBond() public view {
        uint256 slashed = vault.cumulativeOperatorSlashed(INST_ID);
        uint256 deposited = vault.cumulativeOperatorDeposited(INST_ID);
        uint256 currentBond = vault.operatorBondOf(INST_ID);

        assertLe(slashed, deposited, "Slashed exceeded total deposited bond");
        assertLe(currentBond + slashed, deposited, "Current bond + slashed exceeded deposited");
    }

    /// @notice Invariant 3: Any anchored batch is finalized by VerifierQuorum at most once.
    function invariant_batchFinalizedAtMostOnce() public view {
        uint256[] memory batchIds = handler.getAnchoredBatchIds();
        for (uint256 i = 0; i < batchIds.length; ++i) {
            assertLe(handler.finalizeSuccessCount(batchIds[i]), 1, "Batch finalized more than once");
        }
    }

    /// @notice Invariant 4: Sequence numbers for every device are strictly increasing, gapless, and non-overlapping.
    function invariant_sequenceNumbersOnlyIncrease() public view {
        _assertDeviceSequenceMonotonic(DEV_ID_1);
        _assertDeviceSequenceMonotonic(DEV_ID_2);
    }

    /// @notice Invariant 5: Only registered devices can ever have anchored batches.
    function invariant_onlyRegisteredNonRevokedCanAnchor() public view {
        uint256[] memory batchIds = handler.getAnchoredBatchIds();
        for (uint256 i = 0; i < batchIds.length; ++i) {
            BatchAnchor.BatchRecord memory b = anchor.getBatch(batchIds[i]);
            DeviceRegistry.DeviceInfo memory d = registry.getDevice(b.deviceId);
            assertTrue(
                d.status != DeviceRegistry.DeviceStatus.Unregistered,
                "Unregistered device anchored a batch"
            );
        }
    }

    function _assertDeviceSequenceMonotonic(bytes32 devId) internal view {
        uint256[] memory bIds = handler.getDeviceBatches(devId);
        for (uint256 i = 0; i < bIds.length; ++i) {
            BatchAnchor.BatchRecord memory b = anchor.getBatch(bIds[i]);
            assertLe(b.firstSeq, b.lastSeq, "lastSeq < firstSeq");
            assertEq(uint256(b.firstSeq) + uint256(b.count) - 1, uint256(b.lastSeq), "count mismatch");
            if (i == 0) {
                assertEq(b.firstSeq, 0, "First batch did not start at seq 0");
            } else {
                BatchAnchor.BatchRecord memory prev = anchor.getBatch(bIds[i - 1]);
                assertEq(b.firstSeq, prev.lastSeq + 1, "Non-contiguous sequence numbers between batches");
            }
        }
    }
}
