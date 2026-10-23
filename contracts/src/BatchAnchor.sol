// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {DeviceRegistry} from "./DeviceRegistry.sol";
import {BondVault} from "./BondVault.sol";

/// @title BatchAnchor
/// @notice Anchors 32-byte batch Merkle roots and enforces strictly contiguous, non-overlapping sequence numbers per device.
/// @dev Conforms to docs/INTERFACES.md Section 8.4. No upgradeable proxies.
contract BatchAnchor is AccessControl, Pausable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant QUORUM_CONTRACT_ROLE = keccak256("QUORUM_CONTRACT_ROLE");
    bytes32 public constant CHALLENGE_CONTRACT_ROLE = keccak256("CHALLENGE_CONTRACT_ROLE");

    enum BatchStatus {
        None,
        Anchored,
        Verified,
        Quarantined,
        Slashed,
        Cleared
    }

    struct BatchRecord {
        uint256 batchId;
        bytes32 deviceId;
        bytes32 installationId;
        bytes32 merkleRoot;
        uint64 firstSeq;
        uint64 lastSeq;
        uint32 count;
        uint64 anchoredAt;
        BatchStatus status;
    }

    error DeviceNotActive(bytes32 deviceId);
    error InsufficientOperatorBond(bytes32 installationId);
    error InvalidSequenceRange(uint64 expectedFirstSeq, uint64 actualFirstSeq, uint64 lastSeq, uint32 count);
    error EmptyMerkleRoot();
    error DuplicateMerkleRoot(bytes32 merkleRoot);
    error BatchNotFound(uint256 batchId);
    error InvalidStatusTransition(BatchStatus current, BatchStatus requested);
    error UnauthorizedCaller(address caller);
    error ZeroAddress();

    event BatchAnchored(
        uint256 indexed batchId,
        bytes32 indexed deviceId,
        bytes32 indexed installationId,
        bytes32 merkleRoot,
        uint64 firstSeq,
        uint64 lastSeq,
        uint32 count
    );
    event BatchStatusUpdated(uint256 indexed batchId, BatchStatus oldStatus, BatchStatus newStatus);

    DeviceRegistry public immutable deviceRegistry;
    BondVault public immutable bondVault;

    uint256 public nextBatchId = 1;
    mapping(uint256 => BatchRecord) private _batches;
    mapping(bytes32 => uint64) public expectedFirstSeq;
    mapping(bytes32 => bool) public anchoredMerkleRoots;

    /// @notice Initializes BatchAnchor with references to DeviceRegistry and BondVault.
    /// @param admin Administrator address.
    /// @param registry DeviceRegistry contract reference.
    /// @param vault BondVault contract reference.
    constructor(address admin, DeviceRegistry registry, BondVault vault) {
        if (admin == address(0) || address(registry) == address(0) || address(vault) == address(0)) {
            revert ZeroAddress();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        deviceRegistry = registry;
        bondVault = vault;
    }

    /// @notice Anchors a new batch Merkle root for a registered, active device.
    /// @param deviceId Deterministic bytes32 identifier of the active device.
    /// @param merkleRoot 32-byte keccak256 Merkle root of the batch packets.
    /// @param firstSeq Sequence number of the first packet in the batch.
    /// @param lastSeq Sequence number of the last packet in the batch.
    /// @param count Number of packets in the batch (must equal lastSeq - firstSeq + 1).
    /// @return batchId Monotonically increasing batch identifier (1-indexed).
    function anchorBatch(
        bytes32 deviceId,
        bytes32 merkleRoot,
        uint64 firstSeq,
        uint64 lastSeq,
        uint32 count
    ) external whenNotPaused returns (uint256 batchId) {
        if (merkleRoot == bytes32(0)) revert EmptyMerkleRoot();
        if (anchoredMerkleRoots[merkleRoot]) revert DuplicateMerkleRoot(merkleRoot);
        anchoredMerkleRoots[merkleRoot] = true;

        DeviceRegistry.DeviceInfo memory dev = deviceRegistry.getDevice(deviceId);
        if (dev.status != DeviceRegistry.DeviceStatus.Active) {
            revert DeviceNotActive(deviceId);
        }
        if (msg.sender != dev.operator) {
            revert UnauthorizedCaller(msg.sender);
        }
        if (!bondVault.hasSufficientOperatorBond(dev.installationId)) {
            revert InsufficientOperatorBond(dev.installationId);
        }

        uint64 expected = expectedFirstSeq[deviceId];
        if (
            count == 0 ||
            firstSeq != expected ||
            lastSeq < firstSeq ||
            uint256(firstSeq) + uint256(count) - 1 != uint256(lastSeq) ||
            lastSeq == type(uint64).max
        ) {
            revert InvalidSequenceRange(expected, firstSeq, lastSeq, count);
        }

        expectedFirstSeq[deviceId] = lastSeq + 1;

        batchId = nextBatchId++;
        _batches[batchId] = BatchRecord({
            batchId: batchId,
            deviceId: deviceId,
            installationId: dev.installationId,
            merkleRoot: merkleRoot,
            firstSeq: firstSeq,
            lastSeq: lastSeq,
            count: count,
            anchoredAt: uint64(block.timestamp),
            status: BatchStatus.Anchored
        });

        emit BatchAnchored(batchId, deviceId, dev.installationId, merkleRoot, firstSeq, lastSeq, count);
    }

    /// @notice Updates the lifecycle status of an anchored batch.
    /// @dev Callable only by VerifierQuorum (Anchored -> Verified/Quarantined) or Challenge (Quarantined -> Slashed/Cleared).
    /// @param batchId The batch identifier.
    /// @param newStatus Target BatchStatus.
    function updateBatchStatus(uint256 batchId, BatchStatus newStatus) external whenNotPaused {
        BatchRecord storage b = _batches[batchId];
        if (b.status == BatchStatus.None) revert BatchNotFound(batchId);

        BatchStatus current = b.status;
        if (hasRole(QUORUM_CONTRACT_ROLE, msg.sender)) {
            if (
                current != BatchStatus.Anchored ||
                (newStatus != BatchStatus.Verified && newStatus != BatchStatus.Quarantined)
            ) {
                revert InvalidStatusTransition(current, newStatus);
            }
        } else if (hasRole(CHALLENGE_CONTRACT_ROLE, msg.sender)) {
            if (
                current != BatchStatus.Quarantined ||
                (newStatus != BatchStatus.Slashed && newStatus != BatchStatus.Cleared)
            ) {
                revert InvalidStatusTransition(current, newStatus);
            }
        } else {
            revert UnauthorizedCaller(msg.sender);
        }

        b.status = newStatus;
        emit BatchStatusUpdated(batchId, current, newStatus);
    }

    /// @notice Returns the full BatchRecord for a given batchId.
    /// @param batchId The batch identifier.
    /// @return BatchRecord struct.
    function getBatch(uint256 batchId) external view returns (BatchRecord memory) {
        BatchRecord memory b = _batches[batchId];
        if (b.status == BatchStatus.None) revert BatchNotFound(batchId);
        return b;
    }

    /// @notice Verifies that a packet hash is included in a batch's Merkle root using OpenZeppelin MerkleProof.
    /// @param batchId The batch identifier.
    /// @param packetHash 32-byte SHA-256 hash of the canonical JSON packet (without signature).
    /// @param siblings Ordered Merkle proof sibling hashes from bottom (leaf level) to top.
    /// @return True if the proof is valid against the batch's anchored Merkle root.
    function verifyPacketInclusion(
        uint256 batchId,
        bytes32 packetHash,
        bytes32[] calldata siblings
    ) external view returns (bool) {
        BatchRecord memory b = _batches[batchId];
        if (b.status == BatchStatus.None) revert BatchNotFound(batchId);
        bytes32 leaf = keccak256(abi.encodePacked(packetHash));
        return MerkleProof.verifyCalldata(siblings, b.merkleRoot, leaf);
    }

    /// @notice Pauses state-mutating operations. Callable only by ADMIN_ROLE.
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpauses state-mutating operations. Callable only by ADMIN_ROLE.
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }
}
