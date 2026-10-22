import { parseAbi } from "viem";

export const BatchAnchorAbi = parseAbi([
  "function getBatch(uint256 batchId) external view returns ((uint256 batchId, bytes32 deviceId, bytes32 installationId, bytes32 merkleRoot, uint64 firstSeq, uint64 lastSeq, uint32 count, uint64 anchoredAt, uint8 status))",
  "function verifyPacketInclusion(uint256 batchId, bytes32 packetHash, bytes32[] calldata siblings) external view returns (bool)",
  "function nextBatchId() external view returns (uint256)",
  "event BatchAnchored(uint256 indexed batchId, bytes32 indexed deviceId, bytes32 indexed installationId, bytes32 merkleRoot, uint64 firstSeq, uint64 lastSeq, uint32 count)",
  "event BatchStatusUpdated(uint256 indexed batchId, uint8 oldStatus, uint8 newStatus)"
]);

export const AttestationAbi = parseAbi([
  "function getAttestation(uint256 attestationId) external view returns ((uint256 attestationId, bytes32 installationId, string periodLabel, uint256 totalEmissionsKgCo2e, uint256 productionKg, uint16 coverageBp, bytes32 periodMerkleRoot, uint64 attestedAt, address attestedBy))",
  "function getAttestationBatchIds(uint256 attestationId) external view returns (uint256[] memory)",
  "function nextAttestationId() external view returns (uint256)",
  "event AttestationRecorded(uint256 indexed attestationId, bytes32 indexed installationId, string periodLabel, uint256 totalEmissionsKgCo2e, uint256 productionKg, uint16 coverageBp, bytes32 periodMerkleRoot)"
]);

export const BondVaultAbi = parseAbi([
  "function getVaultSummary(bytes32 installationId) external view returns (uint256 totalOperatorBond, uint256 slashedOperatorBond, uint256 activeOperatorBond, bool isSufficient)",
  "function getVerifierStake(address verifier) external view returns (uint256 totalStake, uint256 slashedStake, uint256 activeStake, bool isSufficient)"
]);

export const VerifierQuorumAbi = parseAbi([
  "function getBatchQuorumState(uint256 batchId) external view returns (uint8 phase, uint8 finalVerdict, uint16 finalScoreBp, uint8 matchCount, uint64 commitDeadline, uint64 revealDeadline)"
]);

export const ChallengeAbi = parseAbi([
  "function getChallenge(uint256 batchId) external view returns (uint8 status, uint64 openedAt, uint64 expiresAt, bytes32 evidencePayloadHash, address disputer, string disputeNotes, uint8 arbiterApprovalCount, address[] approvedArbiters)"
]);
