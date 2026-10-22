// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {DeviceRegistry} from "./DeviceRegistry.sol";
import {BondVault} from "./BondVault.sol";
import {BatchAnchor} from "./BatchAnchor.sol";
import {VerifierQuorum, IChallenge} from "./VerifierQuorum.sol";

/// @title Challenge
/// @notice Manages the optimistic challenge window for quarantined batches, operator disputes (with Merkle proof
///         verification), 2-of-3 arbiter council resolution, and settlement triggers to BondVault.
/// @dev Conforms to docs/INTERFACES.md Section 8.6. No upgradeable proxies.
contract Challenge is AccessControl, Pausable, IChallenge {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");
    bytes32 public constant QUORUM_CONTRACT_ROLE = keccak256("QUORUM_CONTRACT_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    uint16 public constant MAX_BPS = 10_000;

    enum ChallengeStatus {
        None,
        Open,
        DisputedByOperator,
        UpheldSlashed,
        OverturnedCleared,
        ExpiredSlashed
    }

    struct ChallengeRecord {
        uint256 batchId;
        bytes32 installationId;
        bytes32 evidenceHash;
        bytes32 operatorDisputeHash;
        uint64 windowClosesAt;
        ChallengeStatus status;
    }

    error ChallengeAlreadyExists(uint256 batchId);
    error ChallengeNotFound(uint256 batchId);
    error ChallengeWindowExpired(uint256 batchId, uint64 windowClosesAt);
    error ChallengeWindowStillOpen(uint256 batchId, uint64 windowClosesAt);
    error ChallengeAlreadySettled(uint256 batchId);
    error OperatorAlreadyDisputed(uint256 batchId);
    error ArbiterAlreadyVoted(uint256 batchId, address arbiter);
    error BatchNotQuarantined(uint256 batchId);
    error InvalidMerkleProof(uint256 batchId, bytes32 packetHash);
    error InvalidEvidenceHash();
    error InvalidConfig();
    error UnauthorizedCaller(address caller);
    error ZeroAddress();

    event ChallengeOpened(
        uint256 indexed batchId,
        bytes32 indexed installationId,
        bytes32 evidenceHash,
        uint64 windowClosesAt
    );
    event OperatorDisputeSubmitted(
        uint256 indexed batchId,
        address indexed operator,
        bytes32 disputeEvidenceHash,
        string explanationUri
    );
    event ArbiterVoteCast(
        uint256 indexed batchId,
        address indexed arbiter,
        bool upholdFraudFlag,
        uint8 currentVotes,
        uint8 requiredVotes
    );
    event ChallengeResolved(
        uint256 indexed batchId,
        bool fraudUpheld,
        address indexed arbiter,
        string resolutionNotes
    );
    event ChallengeSettled(uint256 indexed batchId, ChallengeStatus finalStatus, uint256 slashedAmount);

    DeviceRegistry public immutable deviceRegistry;
    BondVault public immutable bondVault;
    BatchAnchor public immutable batchAnchor;
    VerifierQuorum public immutable verifierQuorum;

    address public immutable treasury;
    uint64 public immutable challengeWindowSeconds;
    uint16 public immutable operatorSlashBps;
    uint16 public immutable carelessVerifierSlashBps;
    uint8 public immutable requiredArbiterApprovals;

    mapping(uint256 => ChallengeRecord) private _challenges;
    mapping(uint256 => mapping(address => bool)) public arbiterHasVoted;
    mapping(uint256 => uint8) public upholdVotes;
    mapping(uint256 => uint8) public overturnVotes;

    /// @notice Initializes Challenge with contract references, window duration, slashing rates, and 2-of-3 arbiter council.
    /// @param admin Administrator address.
    /// @param registry DeviceRegistry reference.
    /// @param vault BondVault reference.
    /// @param anchor BatchAnchor reference.
    /// @param quorum VerifierQuorum reference.
    /// @param treasuryAddr Treasury recipient address.
    /// @param challengeWindow Challenge window in seconds (120 for demo, 86400 for real/benchmark).
    /// @param opSlashBps Share of operator bond slashed on upheld/expired fraud in bps (e.g. 5000 = 50%).
    /// @param verSlashBps Share of flagging verifier stake slashed on overturned flag in bps (e.g. 1000 = 10%).
    /// @param requiredApprovals Number of ARBITER_ROLE approvals required to resolve (default 2 of 3).
    constructor(
        address admin,
        DeviceRegistry registry,
        BondVault vault,
        BatchAnchor anchor,
        VerifierQuorum quorum,
        address treasuryAddr,
        uint64 challengeWindow,
        uint16 opSlashBps,
        uint16 verSlashBps,
        uint8 requiredApprovals
    ) {
        if (
            admin == address(0) ||
            address(registry) == address(0) ||
            address(vault) == address(0) ||
            address(anchor) == address(0) ||
            address(quorum) == address(0) ||
            treasuryAddr == address(0)
        ) {
            revert ZeroAddress();
        }
        if (
            challengeWindow == 0 ||
            opSlashBps > MAX_BPS ||
            verSlashBps > MAX_BPS ||
            requiredApprovals == 0
        ) {
            revert InvalidConfig();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(QUORUM_CONTRACT_ROLE, address(quorum));

        deviceRegistry = registry;
        bondVault = vault;
        batchAnchor = anchor;
        verifierQuorum = quorum;
        treasury = treasuryAddr;
        challengeWindowSeconds = challengeWindow;
        operatorSlashBps = opSlashBps;
        carelessVerifierSlashBps = verSlashBps;
        requiredArbiterApprovals = requiredApprovals;
    }

    /// @notice Opens a challenge window for a quarantined batch and locks operator bond withdrawals in BondVault.
    /// @dev Callable automatically by VerifierQuorum upon Fraud quorum or by a registered VERIFIER_ROLE.
    /// @param batchId Identifier of the quarantined batch.
    /// @param evidenceHash 32-byte hash of the quarantine evidence payload.
    function openChallenge(uint256 batchId, bytes32 evidenceHash) external whenNotPaused {
        if (
            !hasRole(QUORUM_CONTRACT_ROLE, msg.sender) &&
            !hasRole(VERIFIER_ROLE, msg.sender) &&
            !verifierQuorum.isRegisteredVerifier(msg.sender)
        ) {
            revert UnauthorizedCaller(msg.sender);
        }
        if (evidenceHash == bytes32(0)) revert InvalidEvidenceHash();
        if (_challenges[batchId].status != ChallengeStatus.None) {
            revert ChallengeAlreadyExists(batchId);
        }

        BatchAnchor.BatchRecord memory b = batchAnchor.getBatch(batchId);
        if (b.status != BatchAnchor.BatchStatus.Quarantined) {
            revert BatchNotQuarantined(batchId);
        }

        uint64 closesAt = uint64(block.timestamp) + challengeWindowSeconds;
        _challenges[batchId] = ChallengeRecord({
            batchId: batchId,
            installationId: b.installationId,
            evidenceHash: evidenceHash,
            operatorDisputeHash: bytes32(0),
            windowClosesAt: closesAt,
            status: ChallengeStatus.Open
        });

        emit ChallengeOpened(batchId, b.installationId, evidenceHash, closesAt);
        bondVault.setChallengeStatus(b.installationId, true);
    }

    /// @notice Submits an operator dispute before the challenge window expires.
    /// @param batchId Identifier of the challenged batch.
    /// @param disputeEvidenceHash 32-byte hash of the operator's counter-evidence bundle.
    /// @param explanationUri Off-chain URI or reference string explaining the dispute.
    function submitOperatorDispute(
        uint256 batchId,
        bytes32 disputeEvidenceHash,
        string calldata explanationUri
    ) external whenNotPaused {
        _recordDispute(batchId, disputeEvidenceHash, explanationUri);
    }

    /// @notice Submits an operator dispute along with an on-chain Merkle inclusion proof for a disputed packet.
    /// @param batchId Identifier of the challenged batch.
    /// @param disputeEvidenceHash 32-byte hash of the operator's counter-evidence bundle.
    /// @param packetHash 32-byte SHA-256 hash of the canonical JSON packet being proven.
    /// @param merkleSiblings Sibling hashes proving inclusion of packetHash in the batch's anchored Merkle root.
    /// @param explanationUri Off-chain URI or reference string explaining the dispute.
    function submitOperatorDispute(
        uint256 batchId,
        bytes32 disputeEvidenceHash,
        bytes32 packetHash,
        bytes32[] calldata merkleSiblings,
        string calldata explanationUri
    ) external whenNotPaused {
        bool validProof = batchAnchor.verifyPacketInclusion(batchId, packetHash, merkleSiblings);
        if (!validProof) {
            revert InvalidMerkleProof(batchId, packetHash);
        }
        _recordDispute(batchId, disputeEvidenceHash, explanationUri);
    }

    /// @notice Casts an arbiter council vote to resolve a challenge, executing settlement once the approval threshold (e.g. 2-of-3) is met.
    /// @param batchId Identifier of the challenged batch.
    /// @param upholdFraudFlag True to uphold fraud and slash operator bond; false to overturn and penalize flagging verifiers.
    /// @param resolutionNotes Human-readable audit notes explaining the decision.
    function resolve(
        uint256 batchId,
        bool upholdFraudFlag,
        string calldata resolutionNotes
    ) external whenNotPaused {
        if (!hasRole(ARBITER_ROLE, msg.sender)) {
            revert UnauthorizedCaller(msg.sender);
        }

        ChallengeRecord storage c = _challenges[batchId];
        if (c.status == ChallengeStatus.None) revert ChallengeNotFound(batchId);
        if (
            c.status == ChallengeStatus.UpheldSlashed ||
            c.status == ChallengeStatus.OverturnedCleared ||
            c.status == ChallengeStatus.ExpiredSlashed
        ) {
            revert ChallengeAlreadySettled(batchId);
        }
        if (arbiterHasVoted[batchId][msg.sender]) {
            revert ArbiterAlreadyVoted(batchId, msg.sender);
        }

        arbiterHasVoted[batchId][msg.sender] = true;

        if (upholdFraudFlag) {
            uint8 votes = ++upholdVotes[batchId];
            emit ArbiterVoteCast(batchId, msg.sender, true, votes, requiredArbiterApprovals);
            if (votes >= requiredArbiterApprovals) {
                _executeUpheld(c, ChallengeStatus.UpheldSlashed, msg.sender, resolutionNotes, true);
            }
        } else {
            uint8 votes = ++overturnVotes[batchId];
            emit ArbiterVoteCast(batchId, msg.sender, false, votes, requiredArbiterApprovals);
            if (votes >= requiredArbiterApprovals) {
                _executeOverturned(c, msg.sender, resolutionNotes);
            }
        }
    }

    /// @notice Settles an undisputed challenge after the challenge window expires, slashing the operator bond.
    /// @param batchId Identifier of the challenged batch.
    function settleExpired(uint256 batchId) external whenNotPaused {
        ChallengeRecord storage c = _challenges[batchId];
        if (c.status == ChallengeStatus.None) revert ChallengeNotFound(batchId);
        if (
            c.status == ChallengeStatus.UpheldSlashed ||
            c.status == ChallengeStatus.OverturnedCleared ||
            c.status == ChallengeStatus.ExpiredSlashed
        ) {
            revert ChallengeAlreadySettled(batchId);
        }
        if (c.status == ChallengeStatus.DisputedByOperator) {
            revert OperatorAlreadyDisputed(batchId);
        }
        if (uint64(block.timestamp) < c.windowClosesAt) {
            revert ChallengeWindowStillOpen(batchId, c.windowClosesAt);
        }

        _executeUpheld(c, ChallengeStatus.ExpiredSlashed, msg.sender, "Challenge window expired without dispute", false);
    }

    /// @notice Returns the full ChallengeRecord for a batch.
    /// @param batchId Identifier of the batch.
    /// @return ChallengeRecord struct.
    function getChallenge(uint256 batchId) external view returns (ChallengeRecord memory) {
        ChallengeRecord memory c = _challenges[batchId];
        if (c.status == ChallengeStatus.None) revert ChallengeNotFound(batchId);
        return c;
    }

    /// @notice Pauses state-mutating operations. Callable only by ADMIN_ROLE.
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpauses state-mutating operations. Callable only by ADMIN_ROLE.
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function _recordDispute(
        uint256 batchId,
        bytes32 disputeEvidenceHash,
        string calldata explanationUri
    ) internal {
        if (disputeEvidenceHash == bytes32(0)) revert InvalidEvidenceHash();

        ChallengeRecord storage c = _challenges[batchId];
        if (c.status == ChallengeStatus.None) revert ChallengeNotFound(batchId);
        if (
            c.status == ChallengeStatus.UpheldSlashed ||
            c.status == ChallengeStatus.OverturnedCleared ||
            c.status == ChallengeStatus.ExpiredSlashed
        ) {
            revert ChallengeAlreadySettled(batchId);
        }
        if (c.status == ChallengeStatus.DisputedByOperator) {
            revert OperatorAlreadyDisputed(batchId);
        }

        address op = deviceRegistry.getInstallationOperator(c.installationId);
        if (msg.sender != op) {
            revert UnauthorizedCaller(msg.sender);
        }
        if (uint64(block.timestamp) >= c.windowClosesAt) {
            revert ChallengeWindowExpired(batchId, c.windowClosesAt);
        }

        c.operatorDisputeHash = disputeEvidenceHash;
        c.status = ChallengeStatus.DisputedByOperator;

        emit OperatorDisputeSubmitted(batchId, msg.sender, disputeEvidenceHash, explanationUri);
    }

    function _executeUpheld(
        ChallengeRecord storage c,
        ChallengeStatus finalStatus,
        address decider,
        string memory notes,
        bool emitResolved
    ) internal {
        uint256 batchId = c.batchId;
        bytes32 instId = c.installationId;

        c.status = finalStatus;
        bondVault.setChallengeStatus(instId, false);
        batchAnchor.updateBatchStatus(batchId, BatchAnchor.BatchStatus.Slashed);

        uint256 currentBond = bondVault.operatorBondOf(instId);
        uint256 slashAmount = (currentBond * operatorSlashBps) / MAX_BPS;
        address[] memory honestVerifiers = verifierQuorum.getBatchVerifiers(batchId, VerifierQuorum.Verdict.Fraud);

        if (slashAmount > 0) {
            bondVault.slashOperator(instId, slashAmount, honestVerifiers, treasury);
        }

        if (emitResolved) {
            emit ChallengeResolved(batchId, true, decider, notes);
        }
        emit ChallengeSettled(batchId, finalStatus, slashAmount);
    }

    function _executeOverturned(
        ChallengeRecord storage c,
        address decider,
        string memory notes
    ) internal {
        uint256 batchId = c.batchId;
        bytes32 instId = c.installationId;

        c.status = ChallengeStatus.OverturnedCleared;
        bondVault.setChallengeStatus(instId, false);
        batchAnchor.updateBatchStatus(batchId, BatchAnchor.BatchStatus.Cleared);

        address operator = deviceRegistry.getInstallationOperator(instId);
        address[] memory carelessVerifiers = verifierQuorum.getBatchVerifiers(batchId, VerifierQuorum.Verdict.Fraud);
        uint256 totalSlashed = 0;

        if (operator != address(0) && carelessVerifierSlashBps > 0) {
            for (uint256 i = 0; i < carelessVerifiers.length; ++i) {
                address v = carelessVerifiers[i];
                uint256 vStake = bondVault.verifierStakeOf(v);
                uint256 penalty = (vStake * carelessVerifierSlashBps) / MAX_BPS;
                if (penalty > 0) {
                    bondVault.slashVerifier(v, penalty, operator);
                    totalSlashed += penalty;
                }
            }
        }

        emit ChallengeResolved(batchId, false, decider, notes);
        emit ChallengeSettled(batchId, ChallengeStatus.OverturnedCleared, totalSlashed);
    }
}
