import React, { useEffect, useRef } from "react";
import { X, ExternalLink, ShieldCheck, CheckCircle2, Terminal, Copy } from "lucide-react";
import testnetDeployment from "../../../deployments/testnet.json" with { type: "json" };
import rawSummary from "../../../results/benchmark_summary.json" with { type: "json" };
import rawManifest from "../../../results/run_manifest.json" with { type: "json" };

interface ProofModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProofModal: React.FC<ProofModalProps> = ({ isOpen, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [copiedCmd, setCopiedCmd] = React.useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 1. Deployed Contracts (Read dynamically from deployments/testnet.json)
  const explorerBase = testnetDeployment?.explorerBaseUrl || "https://sepolia.arbiscan.io";
  const rawContracts = (testnetDeployment?.contracts || {}) as Record<string, string>;
  const rawDetail = (testnetDeployment?.contracts_detail || {}) as Record<
    string,
    { address?: string; explorerUrl?: string }
  >;

  const contractsList = Object.entries(rawContracts)
    .map(([name, addr]) => {
      const address = rawDetail[name]?.address || addr;
      const explorerUrl =
        rawDetail[name]?.explorerUrl || (address ? `${explorerBase}/address/${address}` : "");
      return { name, address, explorerUrl };
    })
    .filter((c) => Boolean(c.address && c.address !== "null" && c.address.startsWith("0x")));

  // 2. Benchmark Summary (Read dynamically from results/benchmark_summary.json)
  const summaryObj = rawSummary && typeof rawSummary === "object" ? (rawSummary as any) : null;
  const attacksList = Object.values(summaryObj?.attacks || {}) as any[];
  const attacksTested =
    typeof summaryObj?.n_attacks === "number"
      ? summaryObj.n_attacks
      : attacksList.length > 0
      ? attacksList.length
      : null;

  const attacksBelow50 =
    attacksList.length > 0
      ? attacksList.filter(
          (a) =>
            a?.detectors?.proposed?.recall?.mean !== undefined &&
            a.detectors.proposed.recall.mean < 0.5
        ).length
      : null;

  // 3. Data size (Read dynamically from results/run_manifest.json)
  const manifestObj = rawManifest && typeof rawManifest === "object" ? (rawManifest as any) : null;
  const facilities = manifestObj?.n_facilities_total;
  const hoursPerUnit = manifestObj?.parameters?.series_hours_per_unit;
  const dataSizeStr =
    facilities && hoursPerUnit
      ? `${facilities} facilities · ${hoursPerUnit} hrs/facility`
      : facilities
      ? `${facilities} facilities`
      : null;

  const handleCopy = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const shortenAddress = (addr: string) =>
    addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Proof and Verification"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs select-none animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-lg bg-surface border border-hairline-strong rounded-card shadow-2xl overflow-hidden flex flex-col text-ink focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-hairline bg-surface-soft">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-verified" />
            <span className="font-heading font-bold text-sm text-ink">Proof & Verification</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close proof panel"
            className="p-1 rounded-md text-muted hover:text-ink hover:bg-hairline transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Panel Body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
          {/* 1. Deployed Contracts */}
          {contractsList.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono uppercase font-semibold text-[11px] text-muted-strong tracking-wider">
                  Deployed Contracts ({contractsList.length})
                </span>
                <span className="text-[10px] font-mono text-muted">
                  Chain ID: {testnetDeployment?.chainId ?? 421614}
                </span>
              </div>
              <div className="rounded-xl border border-hairline bg-canvas divide-y divide-hairline overflow-hidden">
                {contractsList.map((c) => (
                  <div key={c.name} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="font-medium text-ink">{c.name}</span>
                    <a
                      href={c.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-brand hover:underline text-[11px]"
                      title={`View ${c.address} on Explorer`}
                    >
                      <span>{shortenAddress(c.address)}</span>
                      <ExternalLink className="w-3 h-3 opacity-70" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Benchmark Summary */}
          {(attacksTested !== null || attacksBelow50 !== null) && (
            <div className="space-y-1.5">
              <span className="font-mono uppercase font-semibold text-[11px] text-muted-strong tracking-wider block">
                Benchmark Summary
              </span>
              <div className="grid grid-cols-2 gap-2">
                {attacksTested !== null && (
                  <div className="p-2.5 rounded-xl border border-hairline bg-canvas flex flex-col justify-between">
                    <span className="text-[11px] text-muted-strong font-medium">Attacks Tested</span>
                    <span className="text-lg font-bold font-mono text-ink mt-0.5">{attacksTested}</span>
                  </div>
                )}
                {attacksBelow50 !== null && (
                  <div className="p-2.5 rounded-xl border border-hairline bg-canvas flex flex-col justify-between">
                    <span className="text-[11px] text-muted-strong font-medium">Attacks Below 50%</span>
                    <span className="text-lg font-bold font-mono text-flagged-ink mt-0.5">
                      {attacksBelow50}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. Run Manifest Data Size */}
          {dataSizeStr && (
            <div className="space-y-1.5">
              <span className="font-mono uppercase font-semibold text-[11px] text-muted-strong tracking-wider block">
                Data Size
              </span>
              <div className="p-2.5 rounded-xl border border-hairline bg-canvas flex items-center justify-between">
                <span className="text-[11px] text-muted-strong font-medium">US EPA CAMPD Dataset</span>
                <span className="font-mono font-semibold text-ink text-xs">{dataSizeStr}</span>
              </div>
            </div>
          )}

          {/* 4. How to verify yourself */}
          <div className="space-y-2 pt-1 border-t border-hairline">
            <div className="flex items-center gap-1.5 text-muted-strong font-mono uppercase text-[11px] font-semibold tracking-wider">
              <Terminal className="w-3.5 h-3.5 text-ink" />
              <span>How to verify yourself</span>
            </div>
            <div className="space-y-1.5">
              {[
                { cmd: "make test", label: "Run all smart contract & verification unit tests" },
                { cmd: "make benchmark", label: "Reproduce 14-attack ML benchmark and honest metrics" },
              ].map(({ cmd, label }) => (
                <div
                  key={cmd}
                  className="flex items-center justify-between p-2 rounded-lg bg-surface-soft border border-hairline"
                >
                  <div className="flex flex-col">
                    <code className="text-xs font-mono font-bold text-ink">{cmd}</code>
                    <span className="text-[10px] text-muted-strong">{label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(cmd)}
                    className="p-1.5 rounded text-muted hover:text-ink hover:bg-hairline transition-colors cursor-pointer"
                    title={`Copy ${cmd}`}
                    aria-label={`Copy ${cmd}`}
                  >
                    {copiedCmd === cmd ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-verified" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
