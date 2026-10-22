// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BondVault} from "./BondVault.sol";
import {BatchAnchor} from "./BatchAnchor.sol";

interface IChallenge {
    function openChallenge(uint256 batchId, bytes32 evidenceHash) external;
}

/// @title VerifierQuorum
/// @notice Manages the 5-verifier committee and two-phase commit-reveal voting on anchored batches.
/// @dev Conforms to docs/INTERFACES.md Section 8.5 and DECISION-05. No upgradeable proxies.
contract VerifierQuorum is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    uint16 public constant MAX_SCORE_BP = 10_000;

    enum Verdict {
        Clean,
        Fraud
    }

    struct RevealedVote {
        address verifier;
        bytes32 modelHash;
        bytes32 inputHash;
        uint16 scoreBp;
        Verdict verdict;
        bool revealed;
    }

    error NotRegisteredVerifier(address caller);
    error InsufficientVerifierStake(address verifier);
    error CommitWindowClosed(uint256 batchId);
    error CommitWindowStillOpen(uint256 batchId);
    error RevealWindowClosed(uint256 batchId);
    error AlreadyCommitted(uint256 batchId, address verifier);
    error NotCommitted(uint256 batchId, address verifier);
    error AlreadyRevealed(uint256 batchId, address verifier);
    error CommitmentMismatch(bytes32 expected, bytes32 actual);
    error InvalidScoreBp(uint16 scoreBp);
    error InputHashMismatch(bytes32 expectedMerkleRoot, bytes32 providedInputHash);
    error QuorumNotReached(uint256 batchId);
    error BatchAlreadyFinalized(uint256 batchId);
    error InvalidQuorumConfig(uint8 verifierCount, uint8 requiredQuorum);
    error MaxVerifiersReached(uint8 maxVerifiers);
    error VerifierAlreadyRegistered(address verifier);
    error ZeroAddress();

    event VerifierRegistered(address indexed verifier, uint256 index);
    event VoteCommitted(uint256 indexed batchId, address indexed verifier, bytes32 commitment);
    event VoteRevealed(
        uint256 indexed batchId,
        address indexed verifier,
        bytes32 modelHash,
        bytes32 inputHash,
        uint16 scoreBp,
        Verdict verdict,
        string reasonCodesCsv
    );
    event QuorumFinalized(
        uint256 indexed batchId,
        Verdict winningVerdict,
        uint8 matchingVotes,
        bytes32 evidenceHash
    );
    event UnrevealedVerifierPenalized(uint256 indexed batchId, address indexed verifier, uint256 penaltyAmount);

    BondVault public immutable bondVault;
    BatchAnchor public immutable batchAnchor;
    IChallenge public challengeContract;
    address public immutable treasury;

    uint8 public immutable maxVerifierCount;
    uint8 public immutable requiredQuorum;
    uint64 public immutable commitWindowSeconds;
    uint64 public immutable revealWindowSeconds;
    uint16 public immutable unrevealedPenaltyBps;

    address[] public registeredVerifiers;
    mapping(address => bool) public isRegisteredVerifier;

    mapping(uint256 => mapping(address => bytes32)) public commitments;
    mapping(uint256 => mapping(address => RevealedVote)) private _votes;
    mapping(uint256 => mapping(Verdict => address[])) private _batchVerifiersByVerdict;
    mapping(uint256 => address[]) private _committedVerifiers;
    mapping(uint256 => bool) public batchFinalized;
    mapping(uint256 => mapping(address => bool)) public unrevealedPenalized;

    /// @notice Initializes VerifierQuorum with committee size, quorum threshold, and window durations.
    /// @param admin Administrator address.
    /// @param vault BondVault contract reference.
    /// @param anchor BatchAnchor contract reference.
    /// @param treasuryAddr Treasury recipient for non-reveal penalties.
    /// @param verifierCount Maximum number of registered verifiers in the committee (default 5).
    /// @param quorumRequired Minimum matching revealed votes for finality (default 3).
    /// @param commitWindow Duration of commit window in seconds.
    /// @param revealWindow Duration of reveal window in seconds.
    /// @param nonRevealPenaltyBps Penalty in basis points of verifier stake for failing to reveal a committed vote.
    constructor(
        address admin,
        BondVault vault,
        BatchAnchor anchor,
        address treasuryAddr,
        uint8 verifierCount,
        uint8 quorumRequired,
        uint64 commitWindow,
        uint64 revealWindow,
        uint16 nonRevealPenaltyBps
    ) {
        if (
            admin == address(0) ||
            address(vault) == address(0) ||
            address(anchor) == address(0) ||
            treasuryAddr == address(0)
        ) {
            revert ZeroAddress();
        }
        if (quorumRequired == 0 || quorumRequired > verifierCount || nonRevealPenaltyBps > MAX_SCORE_BP) {
            revert InvalidQuorumConfig(verifierCount, quorumRequired);
        }

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        bondVault = vault;
        batchAnchor = anchor;
        treasury = treasuryAddr;
        maxVerifierCount = verifierCount;
        requiredQuorum = quorumRequired;
        commitWindowSeconds = commitWindow;
        revealWindowSeconds = revealWindow;
        unrevealedPenaltyBps = nonRevealPenaltyBps;
    }

    /// @notice Sets the Challenge contract reference to auto-open challenges on Fraud finality.
    /// @param challengeAddr Address of the deployed Challenge contract.
    function setChallengeContract(IChallenge challengeAddr) external onlyRole(ADMIN_ROLE) {
        if (address(challengeAddr) == address(0)) revert ZeroAddress();
        challengeContract = challengeAddr;
    }

    /// @notice Registers a verifier address into the committee (up to maxVerifierCount).
    /// @param verifier Address of the verifier to add.
    function registerVerifier(address verifier) external onlyRole(ADMIN_ROLE) {
        if (verifier == address(0)) revert ZeroAddress();
        if (isRegisteredVerifier[verifier]) revert VerifierAlreadyRegistered(verifier);
        if (registeredVerifiers.length >= maxVerifierCount) revert MaxVerifiersReached(maxVerifierCount);

        isRegisteredVerifier[verifier] = true;
        registeredVerifiers.push(verifier);
        _grantRole(VERIFIER_ROLE, verifier);

        emit VerifierRegistered(verifier, registeredVerifiers.length - 1);
    }

    /// @notice Submits a sealed vote commitment during the batch's commit window.
    /// @param batchId Identifier of the anchored batch.
    /// @param commitment keccak256(abi.encode(batchId, modelHash, inputHash, scoreBp, uint8(verdict), salt)).
    function commitVote(uint256 batchId, bytes32 commitment) external whenNotPaused {
        if (!isRegisteredVerifier[msg.sender]) revert NotRegisteredVerifier(msg.sender);
        if (!bondVault.hasSufficientVerifierStake(msg.sender)) {
            revert InsufficientVerifierStake(msg.sender);
        }
        if (commitment == bytes32(0)) revert CommitmentMismatch(bytes32(0), bytes32(0));
        if (batchFinalized[batchId]) revert BatchAlreadyFinalized(batchId);

        BatchAnchor.BatchRecord memory b = batchAnchor.getBatch(batchId);
        uint64 commitEnd = b.anchoredAt + commitWindowSeconds;
        if (uint64(block.timestamp) > commitEnd) {
            revert CommitWindowClosed(batchId);
        }
        if (commitments[batchId][msg.sender] != bytes32(0)) {
            revert AlreadyCommitted(batchId, msg.sender);
        }

        commitments[batchId][msg.sender] = commitment;
        _committedVerifiers[batchId].push(msg.sender);

        emit VoteCommitted(batchId, msg.sender, commitment);
    }

    /// @notice Reveals a previously committed vote during the batch's reveal window.
    /// @param batchId Identifier of the anchored batch.
    /// @param modelHash 32-byte hash of the detection model weights and config.
    /// @param inputHash 32-byte Merkle root of the batch packets evaluated (must match batch.merkleRoot).
    /// @param scoreBp Quantized anomaly score in basis points (0..10000).
    /// @param verdict Verdict enum (0 = Clean, 1 = Fraud).
    /// @param salt 32-byte random salt used in the commitment.
    /// @param reasonCodesCsv Comma-separated canonical reason codes (empty string if Clean).
    function revealVote(
        uint256 batchId,
        bytes32 modelHash,
        bytes32 inputHash,
        uint16 scoreBp,
        Verdict verdict,
        bytes32 salt,
        string calldata reasonCodesCsv
    ) external whenNotPaused {
        if (!isRegisteredVerifier[msg.sender]) revert NotRegisteredVerifier(msg.sender);
        if (!bondVault.hasSufficientVerifierStake(msg.sender)) {
            revert InsufficientVerifierStake(msg.sender);
        }
        if (batchFinalized[batchId]) revert BatchAlreadyFinalized(batchId);
        if (scoreBp > MAX_SCORE_BP) revert InvalidScoreBp(scoreBp);

        _validateReveal(batchId, modelHash, inputHash, scoreBp, verdict, salt);

        RevealedVote storage rv = _votes[batchId][msg.sender];
        rv.verifier = msg.sender;
        rv.modelHash = modelHash;
        rv.inputHash = inputHash;
        rv.scoreBp = scoreBp;
        rv.verdict = verdict;
        rv.revealed = true;
        _batchVerifiersByVerdict[batchId][verdict].push(msg.sender);

        emit VoteRevealed(batchId, msg.sender, modelHash, inputHash, scoreBp, verdict, reasonCodesCsv);
    }

    function _validateReveal(
        uint256 batchId,
        bytes32 modelHash,
        bytes32 inputHash,
        uint16 scoreBp,
        Verdict verdict,
        bytes32 salt
    ) internal view {
        BatchAnchor.BatchRecord memory b = batchAnchor.getBatch(batchId);
        uint64 commitEnd = b.anchoredAt + commitWindowSeconds;
        uint64 nowTs = uint64(block.timestamp);

        if (nowTs <= commitEnd) {
            revert CommitWindowStillOpen(batchId);
        }
        if (nowTs > commitEnd + revealWindowSeconds) {
            revert RevealWindowClosed(batchId);
        }
        if (inputHash != b.merkleRoot) {
            revert InputHashMismatch(b.merkleRoot, inputHash);
        }

        bytes32 expectedCommitment = commitments[batchId][msg.sender];
        if (expectedCommitment == bytes32(0)) {
            revert NotCommitted(batchId, msg.sender);
        }
        if (_votes[batchId][msg.sender].revealed) {
            revert AlreadyRevealed(batchId, msg.sender);
        }

        bytes32 actualCommitment = computeCommitment(batchId, modelHash, inputHash, scoreBp, verdict, salt);
        if (actualCommitment != expectedCommitment) {
            revert CommitmentMismatch(expectedCommitment, actualCommitment);
        }
    }

    /// @notice Finalizes a batch once at least requiredQuorum matching (modelHash, inputHash, verdict) votes exist.
    ///         Also slashes any verifier who committed a vote but failed to reveal after the reveal window closed.
    /// @param batchId Identifier of the batch to finalize.
    function finalize(uint256 batchId) external whenNotPaused nonReentrant {
        if (batchFinalized[batchId]) revert BatchAlreadyFinalized(batchId);

        BatchAnchor.BatchRecord memory b = batchAnchor.getBatch(batchId);
        uint64 revealEnd = b.anchoredAt + commitWindowSeconds + revealWindowSeconds;
        address[] memory committed = _committedVerifiers[batchId];

        // Check consensus over (modelHash, inputHash, verdict) per DECISION-05
        (bool reached, Verdict winningVerdict, uint8 matchingCount, bytes32 winningTupleHash) = _findQuorum(
            batchId,
            committed
        );
        if (!reached) {
            revert QuorumNotReached(batchId);
        }

        // Effects before external interactions (CEI)
        batchFinalized[batchId] = true;
        bytes32 evidenceHash = keccak256(abi.encode(batchId, b.merkleRoot, winningTupleHash, matchingCount));
        emit QuorumFinalized(batchId, winningVerdict, matchingCount, evidenceHash);

        // If reveal window has closed, penalize committed-but-unrevealed verifiers
        if (uint64(block.timestamp) > revealEnd && unrevealedPenaltyBps > 0) {
            for (uint256 i = 0; i < committed.length; ++i) {
                address v = committed[i];
                if (!_votes[batchId][v].revealed && !unrevealedPenalized[batchId][v]) {
                    unrevealedPenalized[batchId][v] = true;
                    uint256 stake = bondVault.verifierStakeOf(v);
                    uint256 penalty = (stake * unrevealedPenaltyBps) / MAX_SCORE_BP;
                    if (penalty > 0) {
                        emit UnrevealedVerifierPenalized(batchId, v, penalty);
                        bondVault.slashVerifier(v, penalty, treasury);
                    }
                }
            }
        }

        if (winningVerdict == Verdict.Clean) {
            batchAnchor.updateBatchStatus(batchId, BatchAnchor.BatchStatus.Verified);
        } else {
            batchAnchor.updateBatchStatus(batchId, BatchAnchor.BatchStatus.Quarantined);
            if (address(challengeContract) != address(0)) {
                challengeContract.openChallenge(batchId, evidenceHash);
            }
        }
    }

    /// @notice Pure helper to compute the DECISION-05 commitment hash over 6 ABI-encoded words (192 bytes).
    function computeCommitment(
        uint256 batchId,
        bytes32 modelHash,
        bytes32 inputHash,
        uint16 scoreBp,
        Verdict verdict,
        bytes32 salt
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(batchId, modelHash, inputHash, scoreBp, uint8(verdict), salt));
    }

    /// @notice Returns the revealed vote struct for a verifier on a batch.
    /// @param batchId The batch identifier.
    /// @param verifier The verifier address.
    /// @return RevealedVote struct.
    function getVote(uint256 batchId, address verifier) external view returns (RevealedVote memory) {
        return _votes[batchId][verifier];
    }

    /// @notice Returns the list of verifiers that revealed a given verdict on a batch.
    /// @param batchId The batch identifier.
    /// @param verdict Verdict enum (Clean or Fraud).
    /// @return Array of verifier addresses.
    function getBatchVerifiers(uint256 batchId, Verdict verdict) external view returns (address[] memory) {
        return _batchVerifiersByVerdict[batchId][verdict];
    }

    /// @notice Returns all registered verifier addresses in the committee.
    function getRegisteredVerifiers() external view returns (address[] memory) {
        return registeredVerifiers;
    }

    /// @notice Pauses state-mutating operations. Callable only by ADMIN_ROLE.
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpauses state-mutating operations. Callable only by ADMIN_ROLE.
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function _findQuorum(
        uint256 batchId,
        address[] memory committed
    ) internal view returns (bool reached, Verdict winningVerdict, uint8 matchingCount, bytes32 winningTupleHash) {
        uint256 n = committed.length;
        for (uint256 i = 0; i < n; ++i) {
            RevealedVote memory vi = _votes[batchId][committed[i]];
            if (!vi.revealed) continue;

            bytes32 tupleHashI = keccak256(abi.encode(vi.modelHash, vi.inputHash, vi.verdict));
            uint8 count = 0;
            for (uint256 j = 0; j < n; ++j) {
                RevealedVote memory vj = _votes[batchId][committed[j]];
                if (!vj.revealed) continue;
                if (
                    vj.modelHash == vi.modelHash &&
                    vj.inputHash == vi.inputHash &&
                    vj.verdict == vi.verdict
                ) {
                    count++;
                }
            }
            if (count >= requiredQuorum && count > matchingCount) {
                reached = true;
                winningVerdict = vi.verdict;
                matchingCount = count;
                winningTupleHash = tupleHashI;
            }
        }
    }
}
