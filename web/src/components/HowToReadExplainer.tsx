import React from "react";
import { ShieldCheck, HelpCircle, FileCheck, Layers, AlertTriangle } from "lucide-react";

export const HowToReadExplainer: React.FC = () => {
  return (
    <section
      role="region"
      aria-labelledby="explainer-heading"
      className="p-6 bg-surface border border-border rounded-2xl space-y-4"
    >
      <div className="flex items-center gap-3 pb-3 border-b border-border/60">
        <div className="p-2 bg-info/10 border border-info/30 rounded-lg text-info">
          <HelpCircle className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <h2 id="explainer-heading" className="text-base font-bold text-text">
            How to Read This Importer Portal & Evidence Pack
          </h2>
          <p className="text-xs text-muted">
            Plain-language guidance for EU authorised declarants, customs authorities, and verifiers
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="p-4 bg-surface-sunken border border-border rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-info font-semibold">
            <ShieldCheck className="w-4 h-4 text-info" />
            <span>1. What Cryptographic Verification Proves</span>
          </div>
          <p className="text-muted leading-relaxed">
            Every smokestack reading is cryptographically signed at the sensor edge and chained into a
            continuous hash sequence. Hourly batches are anchored as 32-byte Keccak-256 Merkle roots on an
            EVM Layer-2 testnet. This portal recomputes the binary Merkle tree locally in your browser and
            compares it against the on-chain <code className="text-info font-mono">Attestation</code> contract,
            ensuring the underlying telemetry has not been tampered with or selectively omitted.
          </p>
        </div>

        <div className="p-4 bg-surface-sunken border border-border rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-warning font-semibold">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <span>2. Why Default Values Carry a Punitive Surcharge</span>
          </div>
          <p className="text-muted leading-relaxed">
            Under Implementing Regulation (EU) 2025/2621, importers who cannot prove actual installation
            emissions must surrender CBAM certificates based on country/product default values plus a
            mandatory markup (+10% in 2026, +20% in 2027, +30% from 2028). Tamper-evident verified SEE data
            unlocks significant financial savings over default markups.
          </p>
        </div>

        <div className="p-4 bg-surface-sunken border border-border rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-verified font-semibold">
            <Layers className="w-4 h-4 text-verified" />
            <span>3. How Free Allocation (SEFA) Is Subtracted</span>
          </div>
          <p className="text-muted leading-relaxed">
            Per Regulation (EU) 2025/2620, Specific Embedded Free Allocation (SEFA) equals:
            <code className="block mt-1 font-mono text-[11px] text-text bg-surface-raised p-1 rounded">
              SEFA = FreeAllocationFactor(year) × CSCF × Benchmark
            </code>
            Only embedded emissions exceeding SEFA are payable (floored at zero). The free-allocation factor
            phases down from 97.5% (2.5% payable) in 2026 to 0.0% (100% payable) by 2034.
          </p>
        </div>

        <div className="p-4 bg-surface-sunken border border-border rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-text font-semibold">
            <FileCheck className="w-4 h-4 text-text" />
            <span>4. Customs Declaration & Evidence Pack</span>
          </div>
          <p className="text-muted leading-relaxed">
            You can export an "Importer Evidence Pack" JSON at any time. It packages the full cryptographic
            verification trail, batch-level quarantined/verified breakdown, regulatory citations, and
            step-by-step formula substitutions. Customs auditors can verify this evidence pack independently
            without relying on plant software.
          </p>
        </div>
      </div>
    </section>
  );
};
