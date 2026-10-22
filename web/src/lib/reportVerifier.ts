/**
 * Browser-side CBAM-aligned Period Report verification module.
 *
 * Implements Feature 1 & 2:
 * 1. Schema validation against `schemas/report.schema.json` with Ajv 2020.
 * 2. Enforces AGENTS.md Rule 5: rejects any report containing the word "official" (case-insensitive).
 * 3. Enforces `cbam_aligned === true`.
 * 4. Recomputes Merkle roots (Keccak-256) for all included batches and the aggregated period tree.
 * 5. Compares roots and attestation records with on-chain `BatchAnchor` and `Attestation` via viem.
 * 6. Supports "OFFLINE SNAPSHOT" mode using recorded snapshots when the chain is unreachable or toggled.
 */

import Ajv2020 from "ajv/dist/2020.js";
import rawReportSchema from "../../../schemas/report.schema.json" with { type: "json" };
import defaultOfflineSnapshot from "../../public/offline_snapshot.json" with { type: "json" };
import { buildMerkleTree, idToBytes32Hex, verifyMerkleProof } from "./merkle.ts";
import { fetchOnChainAttestation, fetchOnChainBatch } from "../chain/chainHelpers.ts";

export interface QuarantinedBatchInfo {
  batch_id: number;
  first_seq: number;
  last_seq: number;
  merkle_root: string;
  reason_codes: string[];
  challenge_status: string;
}

export interface PeriodReportJSON {
  report_version: string;
  cbam_aligned: boolean;
  installation_id: string;
  device_id: string;
  period: {
    label: string;
    start_utc: string;
    end_utc: string;
  };
  totals: {
    verified_emissions_tco2e: number;
    production_tonnes: number;
    specific_embedded_emissions_tco2e_per_t: number;
    heat_input_mmbtu: number;
  };
  coverage: {
    total_batches: number;
    verified_batches: number;
    quarantined_batches_count: number;
    coverage_bp: number;
  };
  quarantined_batches: QuarantinedBatchInfo[];
  merkle_roots: string[];
  transaction_hashes: {
    batch_anchors: string[];
    attestation_tx: string;
  };
  attestation_id: number;
}

export interface ReportEnvelope {
  report_hash?: string;
  operator_public_key?: string;
  operator_signature?: string;
  period_merkle_root?: string;
  verified_batch_ids?: number[];
  total_emissions_kg_co2e?: number;
  production_kg?: number;
  merkle_proofs?: Array<{
    batch_id: number;
    merkle_root: string;
    sample_proof: {
      leaf_index: number;
      packet_hash: string;
      leaf_hash: string;
      siblings: string[];
      merkle_root: string;
    };
    all_proofs?: Array<{
      leaf_index: number;
      packet_hash: string;
      leaf_hash: string;
      siblings: string[];
      merkle_root: string;
    }>;
  }>;
}

export interface VerificationCheck {
  id: string;
  title: string;
  passed: boolean;
  message: string;
  detail?: string;
}

export interface VerificationResult {
  valid: boolean;
  schemaValid: boolean;
  schemaErrors: string[];
  mode: "LIVE" | "OFFLINE SNAPSHOT";
  snapshotNotice?: string;
  report: PeriodReportJSON;
  envelope?: ReportEnvelope;
  computedPeriodMerkleRoot: string;
  checks: VerificationCheck[];
  onChainAttestation?: {
    attestationId: number;
    installationId: string;
    periodLabel: string;
    totalEmissionsKgCo2e: number;
    productionKg: number;
    coverageBp: number;
    periodMerkleRoot: string;
    batchIds: number[];
  };
  onChainBatches?: Array<{
    batchId: number;
    status: string;
    merkleRoot: string;
  }>;
  errors: string[];
}

export interface OfflineSnapshotData {
  snapshot_version: string;
  label: string;
  recorded_at_utc: string;
  chain_id: number;
  network: string;
  block_number: number;
  contracts: {
    BatchAnchor: string;
    Attestation: string;
  };
  data_origin: {
    telemetry: string;
    synthetic_channels: string;
    production_tonnes: string;
    signing: string;
  };
  attestations: Record<
    string,
    {
      attestationId: string;
      installationId: string;
      periodLabel: string;
      totalEmissionsKgCo2e: string;
      productionKg: string;
      coverageBp: number;
      periodMerkleRoot: string;
      attestedAt: string;
      attestedBy: string;
      batchIds: string[];
    }
  >;
  batches: Record<
    string,
    {
      batchId: string;
      deviceId: string;
      installationId: string;
      merkleRoot: string;
      firstSeq: string;
      lastSeq: string;
      count: number;
      anchoredAt: string;
      status: string;
    }
  >;
  packet_inclusion?: Array<{
    batchId: string;
    packetHash: string;
    siblings: string[];
    result: boolean;
  }>;
}

const ajv = new Ajv2020({ allErrors: true });
const validateSchemaFn = ajv.compile(rawReportSchema);

/**
 * Validate a report JSON object against `schemas/report.schema.json`
 * and enforce AGENTS.md Rule 5 (no "official" claim).
 */
export function validateReportSchema(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof data !== "object" || data === null) {
    return { valid: false, errors: ["Report must be a non-null JSON object."] };
  }

  // AGENTS.md Rule 5: Reject if the word 'official' appears anywhere in the report
  const serialized = JSON.stringify(data).toLowerCase();
  if (serialized.includes("official")) {
    errors.push("Report violates AGENTS.md Rule 5: Must never contain the word 'official'.");
  }

  const isValid = validateSchemaFn(data);
  if (!isValid && validateSchemaFn.errors) {
    for (const err of validateSchemaFn.errors) {
      const path = err.instancePath || "root";
      errors.push(`${path}: ${err.message || "schema validation error"}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extract `report` and optional `envelope` from a parsed JSON payload.
 * Supports both standalone report JSON and `{ report, envelope }` wrappers.
 */
export function extractReportAndEnvelope(payload: unknown): {
  report: PeriodReportJSON | null;
  envelope: ReportEnvelope | null;
  parseError?: string;
} {
  if (typeof payload !== "object" || payload === null) {
    return { report: null, envelope: null, parseError: "Payload must be a JSON object" };
  }

  const obj = payload as Record<string, unknown>;
  if ("report" in obj && typeof obj.report === "object" && obj.report !== null) {
    return {
      report: obj.report as PeriodReportJSON,
      envelope: (obj.envelope as ReportEnvelope) || null,
    };
  }

  // Standalone report object
  return {
    report: obj as unknown as PeriodReportJSON,
    envelope: null,
  };
}

/**
 * Perform full browser-side verification of a period report.
 *
 * @param payload Parsed JSON object (or envelope)
 * @param options Mode and snapshot overrides
 */
export async function verifyPeriodReport(
  payload: unknown,
  options: {
    forceOfflineSnapshot?: boolean;
    customSnapshot?: OfflineSnapshotData;
  } = {}
): Promise<VerificationResult> {
  const { report, envelope, parseError } = extractReportAndEnvelope(payload);

  if (parseError || !report) {
    return {
      valid: false,
      schemaValid: false,
      schemaErrors: [parseError || "Invalid report JSON structure"],
      mode: "OFFLINE SNAPSHOT",
      report: {} as PeriodReportJSON,
      computedPeriodMerkleRoot: "0x",
      checks: [
        {
          id: "parse",
          title: "JSON Object Structure",
          passed: false,
          message: parseError || "Invalid report JSON structure",
        },
      ],
      errors: [parseError || "Invalid report JSON structure"],
    };
  }

  // 1. Schema Validation
  const schemaCheck = validateReportSchema(report);
  if (!schemaCheck.valid) {
    return {
      valid: false,
      schemaValid: false,
      schemaErrors: schemaCheck.errors,
      mode: "OFFLINE SNAPSHOT",
      report,
      envelope: envelope || undefined,
      computedPeriodMerkleRoot: "0x",
      checks: [
        {
          id: "schema",
          title: "Schema Validation (schemas/report.schema.json)",
          passed: false,
          message: schemaCheck.errors.join("; "),
        },
      ],
      errors: schemaCheck.errors,
    };
  }

  const checks: VerificationCheck[] = [
    {
      id: "schema",
      title: "Schema & Honesty Compliance",
      passed: true,
      message: "Valid report.schema.json v1.0.0 (cbam_aligned: true, no 'official' claims)",
    },
  ];

  const errors: string[] = [];

  // 2. Browser-side Merkle Proof / Tree Recomputation
  let computedPeriodMerkleRoot = "0x";
  try {
    const periodTree = buildMerkleTree(report.merkle_roots);
    computedPeriodMerkleRoot = periodTree.merkle_root.toLowerCase();
    checks.push({
      id: "period_merkle_root",
      title: "Period Merkle Root Recomputation",
      passed: true,
      message: `Recomputed over ${report.merkle_roots.length} batch roots: ${computedPeriodMerkleRoot}`,
      detail: computedPeriodMerkleRoot,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.push({
      id: "period_merkle_root",
      title: "Period Merkle Root Recomputation",
      passed: false,
      message: `Failed to recompute period Merkle root: ${msg}`,
    });
    errors.push(`Period Merkle root recomputation failed: ${msg}`);
  }

  // 3. Batch Inclusion Proofs (if envelope proofs provided)
  if (envelope?.merkle_proofs && envelope.merkle_proofs.length > 0) {
    let allProofsValid = true;
    for (const bundle of envelope.merkle_proofs) {
      const proof = bundle.sample_proof;
      const ok = verifyMerkleProof(
        proof.leaf_hash,
        proof.siblings,
        bundle.merkle_root,
        proof.packet_hash
      );
      if (!ok) {
        allProofsValid = false;
        errors.push(`Merkle inclusion proof invalid for batch #${bundle.batch_id}`);
      }
    }
    checks.push({
      id: "inclusion_proofs",
      title: "Batch Merkle Inclusion Proofs",
      passed: allProofsValid,
      message: allProofsValid
        ? `Verified ${envelope.merkle_proofs.length} batch inclusion proof(s) via sorted-pair Keccak-256`
        : "One or more Merkle inclusion proofs failed verification",
    });
  }

  // 4. On-chain Attestation & BatchAnchor comparison (or Offline Snapshot)
  let mode: "LIVE" | "OFFLINE SNAPSHOT" = options.forceOfflineSnapshot ? "OFFLINE SNAPSHOT" : "LIVE";
  let snapshotNotice: string | undefined = undefined;

  let attestationData: {
    attestationId: number;
    installationId: string;
    periodLabel: string;
    totalEmissionsKgCo2e: number;
    productionKg: number;
    coverageBp: number;
    periodMerkleRoot: string;
    batchIds: number[];
  } | null = null;

  const onChainBatches: Array<{
    batchId: number;
    status: string;
    merkleRoot: string;
  }> = [];

  const snapshot: OfflineSnapshotData =
    options.customSnapshot || (defaultOfflineSnapshot as unknown as OfflineSnapshotData);

  const attId = report.attestation_id;

  if (mode === "LIVE") {
    try {
      const onChainAtt = await fetchOnChainAttestation(BigInt(attId));
      attestationData = {
        attestationId: Number(onChainAtt.attestationId),
        installationId: onChainAtt.installationId.toLowerCase(),
        periodLabel: onChainAtt.periodLabel,
        totalEmissionsKgCo2e: Number(onChainAtt.totalEmissionsKgCo2e),
        productionKg: Number(onChainAtt.productionKg),
        coverageBp: onChainAtt.coverageBp,
        periodMerkleRoot: onChainAtt.periodMerkleRoot.toLowerCase(),
        batchIds: onChainAtt.batchIds.map((b) => Number(b)),
      };

      for (const bId of attestationData.batchIds) {
        const batchRec = await fetchOnChainBatch(BigInt(bId));
        onChainBatches.push({
          batchId: Number(batchRec.batchId),
          status: batchRec.status,
          merkleRoot: batchRec.merkleRoot.toLowerCase(),
        });
      }
    } catch {
      // Chain unreachable; fallback to OFFLINE SNAPSHOT mode
      mode = "OFFLINE SNAPSHOT";
      snapshotNotice =
        "EVM testnet / local Anvil node was unreachable. Switched automatically to OFFLINE SNAPSHOT mode using recorded state.";
    }
  }

  if (mode === "OFFLINE SNAPSHOT") {
    if (!snapshotNotice) {
      snapshotNotice = `OFFLINE SNAPSHOT mode active: verifying against recorded snapshot (${snapshot.label})`;
    }
    const snapAtt = snapshot.attestations[String(attId)];
    if (snapAtt) {
      attestationData = {
        attestationId: Number(snapAtt.attestationId),
        installationId: snapAtt.installationId.toLowerCase(),
        periodLabel: snapAtt.periodLabel,
        totalEmissionsKgCo2e: Number(snapAtt.totalEmissionsKgCo2e),
        productionKg: Number(snapAtt.productionKg),
        coverageBp: snapAtt.coverageBp,
        periodMerkleRoot: snapAtt.periodMerkleRoot.toLowerCase(),
        batchIds: snapAtt.batchIds.map((b) => Number(b)),
      };

      for (const bId of attestationData.batchIds) {
        const snapBatch = snapshot.batches[String(bId)];
        if (snapBatch) {
          onChainBatches.push({
            batchId: Number(snapBatch.batchId),
            status: snapBatch.status,
            merkleRoot: snapBatch.merkleRoot.toLowerCase(),
          });
        }
      }
    }
  }

  // Compare Attestation Record
  if (!attestationData) {
    checks.push({
      id: "attestation_exists",
      title: "On-Chain Attestation Record",
      passed: false,
      message: `Attestation #${attId} was not found on-chain or in the offline snapshot`,
    });
    errors.push(`Attestation #${attId} not found`);
  } else {
    checks.push({
      id: "attestation_exists",
      title: "On-Chain Attestation Record",
      passed: true,
      message: `Attestation #${attId} exists in Attestation.sol (${mode})`,
    });

    // Check Installation ID
    const expectedInstBytes32 = idToBytes32Hex(report.installation_id).toLowerCase();
    const instMatch = attestationData.installationId.toLowerCase() === expectedInstBytes32;
    checks.push({
      id: "installation_match",
      title: "Installation Identity Match",
      passed: instMatch,
      message: instMatch
        ? `Installation matches on-chain bytes32: ${attestationData.installationId}`
        : `Installation mismatch: expected ${expectedInstBytes32}, got ${attestationData.installationId}`,
    });
    if (!instMatch) {
      errors.push("Installation ID does not match on-chain record");
    }

    // Check Period Label
    const periodMatch = attestationData.periodLabel === report.period.label;
    checks.push({
      id: "period_match",
      title: "Period Label Match",
      passed: periodMatch,
      message: periodMatch
        ? `Period label '${report.period.label}' matches on-chain record`
        : `Period label mismatch: '${report.period.label}' vs '${attestationData.periodLabel}'`,
    });
    if (!periodMatch) {
      errors.push("Period label does not match on-chain record");
    }

    // Check Period Merkle Root
    const rootMatch =
      attestationData.periodMerkleRoot.toLowerCase() === computedPeriodMerkleRoot.toLowerCase();
    checks.push({
      id: "period_root_match",
      title: "Period Merkle Root On-Chain Match",
      passed: rootMatch,
      message: rootMatch
        ? `Period root matches on-chain root: ${attestationData.periodMerkleRoot}`
        : `Period root mismatch: on-chain ${attestationData.periodMerkleRoot} != computed ${computedPeriodMerkleRoot}`,
    });
    if (!rootMatch) {
      errors.push("Period Merkle root does not match on-chain attestation root");
    }

    // Check Coverage Basis Points
    const covMatch = attestationData.coverageBp === report.coverage.coverage_bp;
    checks.push({
      id: "coverage_match",
      title: "Coverage Basis Points Match",
      passed: covMatch,
      message: covMatch
        ? `Coverage of ${report.coverage.coverage_bp} bp (${(report.coverage.coverage_bp / 100).toFixed(1)}%) matches on-chain record`
        : `Coverage mismatch: report has ${report.coverage.coverage_bp} bp, on-chain has ${attestationData.coverageBp} bp`,
    });
    if (!covMatch) {
      errors.push("Coverage basis points do not match on-chain record");
    }

    // Check Verified Batches in BatchAnchor
    let batchesOk = onChainBatches.length === report.merkle_roots.length;
    for (let i = 0; i < onChainBatches.length; i++) {
      const b = onChainBatches[i];
      if (b.status !== "Verified" && b.status !== "Cleared") {
        batchesOk = false;
        errors.push(`Batch #${b.batchId} has unverified status: ${b.status}`);
      }
      if (b.merkleRoot.toLowerCase() !== report.merkle_roots[i]?.toLowerCase()) {
        batchesOk = false;
        errors.push(
          `Batch #${b.batchId} root mismatch: on-chain ${b.merkleRoot} != report ${report.merkle_roots[i]}`
        );
      }
    }
    checks.push({
      id: "batches_verified",
      title: "Batch Status & Root Integrity in BatchAnchor",
      passed: batchesOk,
      message: batchesOk
        ? `All ${onChainBatches.length} batch root(s) are recorded as Verified in BatchAnchor.sol`
        : "One or more batch roots failed status or Merkle root matching in BatchAnchor.sol",
    });
    if (!batchesOk) {
      errors.push("BatchAnchor verification failed for one or more batches");
    }
  }

  const isValid = errors.length === 0 && checks.every((c) => c.passed);

  return {
    valid: isValid,
    schemaValid: true,
    schemaErrors: [],
    mode,
    snapshotNotice,
    report,
    envelope: envelope || undefined,
    computedPeriodMerkleRoot,
    checks,
    onChainAttestation: attestationData || undefined,
    onChainBatches: onChainBatches.length > 0 ? onChainBatches : undefined,
    errors,
  };
}
