// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {DeviceRegistry} from "./DeviceRegistry.sol";
import {BatchAnchor} from "./BatchAnchor.sol";

/// @title Attestation
/// @notice Records non-transferable period-end CBAM-aligned installation attestations linking verified emissions,
///         production mass, coverage basis points, and an aggregated root of verified batch Merkle roots.
/// @dev Conforms to docs/INTERFACES.md Section 8.7. Non-transferable by design (no transfer functions).
contract Attestation is AccessControl, Pausable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    uint16 public constant MAX_COVERAGE_BP = 10_000;

    struct PeriodAttestation {
        uint256 attestationId;
        bytes32 installationId;
        string periodLabel;
        uint256 totalEmissionsKgCo2e; // integer kg CO2e (1 tCO2e = 1000 kg)
        uint256 productionKg; // integer kg product mass
        uint16 coverageBp; // 0..10000 basis points
        bytes32 periodMerkleRoot; // Merkle root over the period's verified batch merkleRoots
        uint64 attestedAt;
        address attestedBy;
    }

    error EmptyBatchList();
    error BatchNotVerified(uint256 batchId);
    error InstallationMismatch(uint256 batchId, bytes32 expectedInstallation, bytes32 actualInstallation);
    error InvalidCoverageBp(uint16 coverageBp);
    error ZeroProductionMass();
    error EmptyPeriodMerkleRoot();
    error AttestationNotFound(uint256 attestationId);
    error UnauthorizedCaller(address caller);
    error ZeroAddress();

    event AttestationRecorded(
        uint256 indexed attestationId,
        bytes32 indexed installationId,
        string periodLabel,
        uint256 totalEmissionsKgCo2e,
        uint256 productionKg,
        uint16 coverageBp,
        bytes32 periodMerkleRoot
    );

    DeviceRegistry public immutable deviceRegistry;
    BatchAnchor public immutable batchAnchor;

    uint256 public nextAttestationId = 1;
    mapping(uint256 => PeriodAttestation) private _attestations;
    mapping(uint256 => uint256[]) private _attestationBatches;

    /// @notice Initializes Attestation with references to DeviceRegistry and BatchAnchor.
    /// @param admin Administrator address.
    /// @param registry DeviceRegistry contract reference.
    /// @param anchor BatchAnchor contract reference.
    constructor(address admin, DeviceRegistry registry, BatchAnchor anchor) {
        if (admin == address(0) || address(registry) == address(0) || address(anchor) == address(0)) {
            revert ZeroAddress();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        deviceRegistry = registry;
        batchAnchor = anchor;
    }

    /// @notice Records a non-transferable period attestation after verifying all referenced batches.
    /// @param installationId Deterministic bytes32 identifier of the installation.
    /// @param periodLabel Reporting period label (e.g. "2026-Q3").
    /// @param totalEmissionsKgCo2e Total verified direct emissions in integer kg CO2e.
    /// @param productionKg Total product mass in integer kg (> 0).
    /// @param coverageBp Verified batch coverage in basis points (0..10000).
    /// @param periodMerkleRoot Aggregated Merkle root over the verified batch Merkle roots.
    /// @param verifiedBatchIds Array of finalized batch IDs included in this period report.
    /// @return attestationId Unique 1-indexed attestation identifier.
    function recordAttestation(
        bytes32 installationId,
        string calldata periodLabel,
        uint256 totalEmissionsKgCo2e,
        uint256 productionKg,
        uint16 coverageBp,
        bytes32 periodMerkleRoot,
        uint256[] calldata verifiedBatchIds
    ) external whenNotPaused returns (uint256 attestationId) {
        address instOp = deviceRegistry.getInstallationOperator(installationId);
        bool isAuthorized = hasRole(ADMIN_ROLE, msg.sender) ||
            (instOp != address(0) && msg.sender == instOp) ||
            (instOp == address(0) && hasRole(OPERATOR_ROLE, msg.sender));
        if (!isAuthorized) {
            revert UnauthorizedCaller(msg.sender);
        }

        if (verifiedBatchIds.length == 0) revert EmptyBatchList();
        if (productionKg == 0) revert ZeroProductionMass();
        if (coverageBp > MAX_COVERAGE_BP) revert InvalidCoverageBp(coverageBp);
        if (periodMerkleRoot == bytes32(0)) revert EmptyPeriodMerkleRoot();

        for (uint256 i = 0; i < verifiedBatchIds.length; ++i) {
            uint256 bId = verifiedBatchIds[i];
            BatchAnchor.BatchRecord memory b = batchAnchor.getBatch(bId);
            if (b.installationId != installationId) {
                revert InstallationMismatch(bId, installationId, b.installationId);
            }
            if (
                b.status != BatchAnchor.BatchStatus.Verified &&
                b.status != BatchAnchor.BatchStatus.Cleared
            ) {
                revert BatchNotVerified(bId);
            }
        }

        attestationId = nextAttestationId++;
        _attestations[attestationId] = PeriodAttestation({
            attestationId: attestationId,
            installationId: installationId,
            periodLabel: periodLabel,
            totalEmissionsKgCo2e: totalEmissionsKgCo2e,
            productionKg: productionKg,
            coverageBp: coverageBp,
            periodMerkleRoot: periodMerkleRoot,
            attestedAt: uint64(block.timestamp),
            attestedBy: msg.sender
        });
        _attestationBatches[attestationId] = verifiedBatchIds;

        emit AttestationRecorded(
            attestationId,
            installationId,
            periodLabel,
            totalEmissionsKgCo2e,
            productionKg,
            coverageBp,
            periodMerkleRoot
        );
    }

    /// @notice Returns the full PeriodAttestation record for an attestationId.
    /// @param attestationId The attestation identifier.
    /// @return PeriodAttestation struct.
    function getAttestation(uint256 attestationId) external view returns (PeriodAttestation memory) {
        PeriodAttestation memory att = _attestations[attestationId];
        if (att.attestationId == 0) revert AttestationNotFound(attestationId);
        return att;
    }

    /// @notice Returns the verified batch IDs associated with an attestationId.
    /// @param attestationId The attestation identifier.
    /// @return Array of batch IDs.
    function getAttestationBatchIds(uint256 attestationId) external view returns (uint256[] memory) {
        if (_attestations[attestationId].attestationId == 0) revert AttestationNotFound(attestationId);
        return _attestationBatches[attestationId];
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
