import React, { useState, useEffect } from "react";
import {
  X,
  ExternalLink,
  ShieldCheck,
  Cpu,
  Lock,
  Layers,
  Scale,
  FileCheck2,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";
import { HashChip } from "./HashChip";
import {
  arbitrumSepoliaDeployment,
  ARBITRUM_SEPOLIA_CHAIN_ID,
  ARBITRUM_SEPOLIA_EXPLORER_BASE,
} from "../chain/deploymentConfig";

export interface ArbitrumSepoliaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ArbitrumSepoliaModal: React.FC<ArbitrumSepoliaModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"milestones" | "contracts" | "all">("milestones");

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const contractsList = [
    {
      name: "DeviceRegistry",
      label: "Device Registry",
      desc: "ECDSA pubkey registration & cryptographic identity authorization for CEMS device",
      icon: Cpu,
      detail: arbitrumSepoliaDeployment.contractsDetail.DeviceRegistry,
    },
    {
      name: "BondVault",
      label: "Bond Vault",
      desc: "Collateralized escrow holding operator bonds and verifier stake deposits",
      icon: Lock,
      detail: arbitrumSepoliaDeployment.contractsDetail.BondVault,
    },
    {
      name: "BatchAnchor",
      label: "Batch Anchor",
      desc: "Tamper-evident on-chain anchoring of hourly telemetry Merkle roots & sequence ranges",
      icon: Layers,
      detail: arbitrumSepoliaDeployment.contractsDetail.BatchAnchor,
    },
    {
      name: "VerifierQuorum",
      label: "Verifier Quorum",
      desc: "3-of-5 commit-reveal quorum voting and independent consensus aggregation",
      icon: Scale,
      detail: arbitrumSepoliaDeployment.contractsDetail.VerifierQuorum,
    },
    {
      name: "Challenge",
      label: "Challenge & Slashing",
      desc: "Bonded dispute window, Arbiter Council resolution, and automated 50% operator bond slashing",
      icon: AlertTriangle,
      detail: arbitrumSepoliaDeployment.contractsDetail.Challenge,
    },
    {
      name: "Attestation",
      label: "Attestation Registry",
      desc: "Period-end EU CBAM-aligned attestation certificate registry linking verified Merkle roots",
      icon: FileCheck2,
      detail: arbitrumSepoliaDeployment.contractsDetail.Attestation,
    },
  ];

  const kt = arbitrumSepoliaDeployment.keyTransactions;
  const fmtGas = (g?: number) => (g ? g.toLocaleString("en-US") : "0");
  const fmtBlock = (b?: number) => (b ? String(b) : "");

  const keyProofs = [
    {
      title: "Honest Batch #4 Anchored",
      action: "BatchAnchor.anchorBatch",
      tag: "HONEST FLOW",
      tagColor: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30",
      txHash: kt.anchorBatchHonest4.txHash,
      explorerUrl: kt.anchorBatchHonest4.explorerUrl,
      gasUsed: fmtGas(kt.anchorBatchHonest4.gasUsed),
      block: fmtBlock(kt.anchorBatchHonest4.block),
      notes: "Authentic CAMPD telemetry Merkle root anchored on L2 testnet",
    },
    {
      title: "EU CBAM-Aligned Attestation #4",
      action: "Attestation.recordAttestation",
      tag: "BUYER PROOF",
      tagColor: "bg-blue-500/10 text-blue-800 dark:text-blue-300 border-blue-500/30",
      txHash: kt.recordAttestation.txHash,
      explorerUrl: kt.recordAttestation.explorerUrl,
      gasUsed: fmtGas(kt.recordAttestation.gasUsed),
      block: fmtBlock(kt.recordAttestation.block),
      notes: "On-chain record created after 3-of-5 quorum consensus verified",
    },
    {
      title: "Tampered Batch #6 Anchored (Attack Injection)",
      action: "BatchAnchor.anchorBatch",
      tag: "ATTACK INJECTED",
      tagColor: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30",
      txHash: kt.anchorBatchTampered6.txHash,
      explorerUrl: kt.anchorBatchTampered6.explorerUrl,
      gasUsed: fmtGas(kt.anchorBatchTampered6.gasUsed),
      block: fmtBlock(kt.anchorBatchTampered6.block),
      notes: "Synthetic scale reduction attack anchored by rogue operator",
    },
    {
      title: "Slashing Resolution (Arbiter Council 2-of-3)",
      action: "Challenge.resolve",
      tag: "SLASH EXECUTED",
      tagColor: "bg-red-500/10 text-red-800 dark:text-red-300 border-red-500/30",
      txHash: kt.resolveSlash.txHash,
      explorerUrl: kt.resolveSlash.explorerUrl,
      gasUsed: fmtGas(kt.resolveSlash.gasUsed),
      block: fmtBlock(kt.resolveSlash.block),
      notes: "Arbiter 1 completed 2-of-3 quorum: Slashed 50% operator bond on L2 testnet",
    },
    {
      title: "CEMS Device Registered",
      action: "DeviceRegistry.registerDevice",
      tag: "REGISTRATION",
      tagColor: "bg-slate-500/10 text-slate-800 dark:text-slate-300 border-slate-500/30",
      txHash: kt.registerDevice.txHash,
      explorerUrl: kt.registerDevice.explorerUrl,
      gasUsed: fmtGas(kt.registerDevice.gasUsed),
      block: fmtBlock(kt.registerDevice.block),
      notes: "Device public key registered with factory installation ID",
    },
    {
      title: "Operator Bond Escrowed",
      action: "BondVault.depositOperatorBond",
      tag: "COLLATERAL",
      tagColor: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30",
      txHash: kt.depositOperatorBond.txHash,
      explorerUrl: kt.depositOperatorBond.explorerUrl,
      gasUsed: fmtGas(kt.depositOperatorBond.gasUsed),
      block: fmtBlock(kt.depositOperatorBond.block),
      notes: "Operator deposited 0.002 ETH bond required for telemetry anchoring",
    },
    {
      title: "Quorum Clean Reveal (Honest V0)",
      action: "VerifierQuorum.revealVote",
      tag: "CONSENSUS",
      tagColor: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30",
      txHash: kt.revealVoteHonestV0.txHash,
      explorerUrl: kt.revealVoteHonestV0.explorerUrl,
      gasUsed: fmtGas(kt.revealVoteHonestV0.gasUsed),
      block: fmtBlock(kt.revealVoteHonestV0.block),
      notes: "Verifier 0 revealed Clean verdict with 0bp anomaly score",
    },
    {
      title: "Quorum Fraud Reveal (Attack V0)",
      action: "VerifierQuorum.revealVote",
      tag: "FRAUD DETECTED",
      tagColor: "bg-red-500/10 text-red-800 dark:text-red-300 border-red-500/30",
      txHash: kt.revealVoteAttackV0.txHash,
      explorerUrl: kt.revealVoteAttackV0.explorerUrl,
      gasUsed: fmtGas(kt.revealVoteAttackV0.gasUsed),
      block: fmtBlock(kt.revealVoteAttackV0.block),
      notes: "Verifier 0 revealed Fraud with score=8500bp & physics residual mismatch",
    },
    {
      title: "Operator Dispute Lodged",
      action: "Challenge.submitOperatorDispute",
      tag: "DISPUTE",
      tagColor: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30",
      txHash: kt.submitOperatorDispute.txHash,
      explorerUrl: kt.submitOperatorDispute.explorerUrl,
      gasUsed: fmtGas(kt.submitOperatorDispute.gasUsed),
      block: fmtBlock(kt.submitOperatorDispute.block),
      notes: "Operator lodged dispute providing Merkle proof to initiate Arbiter review",
    },
    {
      title: "Arbiter 0 Fraud Vote",
      action: "Challenge.resolve",
      tag: "ARBITER VOTE",
      tagColor: "bg-red-500/10 text-red-800 dark:text-red-300 border-red-500/30",
      txHash: kt.resolveVote.txHash,
      explorerUrl: kt.resolveVote.explorerUrl,
      gasUsed: fmtGas(kt.resolveVote.gasUsed),
      block: fmtBlock(kt.resolveVote.block),
      notes: "Arbiter 0 cast 1st vote upholding UPHELD_FRAUD verdict",
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="arbitrum-sepolia-modal-title"
      data-testid="arbitrum-sepolia-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-surface dark:bg-canvas border border-hairline rounded-card shadow-2xl flex flex-col overflow-hidden text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-hairline bg-surface-soft flex items-start justify-between gap-3 shrink-0">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="p-1 rounded-lg bg-brand/10 text-brand">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <h2
                id="arbitrum-sepolia-modal-title"
                className="text-base sm:text-lg font-heading font-bold text-ink"
              >
                Live {arbitrumSepoliaDeployment.chainName} Deployment (Chain {ARBITRUM_SEPOLIA_CHAIN_ID})
              </h2>
              <span className="px-2 py-0.5 rounded-pill text-[11px] font-semibold font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300">
                LIVE TESTNET
              </span>
            </div>
            <p className="text-xs text-muted-strong font-sans">
              All 6 VeriCEMS smart contracts and full lifecycle on-chain fraud challenge transaction proofs deployed to {arbitrumSepoliaDeployment.chainName}.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={ARBITRUM_SEPOLIA_EXPLORER_BASE}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-pill text-xs font-semibold bg-surface hover:bg-hairline border border-hairline text-ink transition-colors"
            >
              <span>Arbiscan Explorer</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-muted-strong" />
            </a>
            <button
              type="button"
              onClick={onClose}
              data-testid="close-testnet-modal-btn"
              aria-label="Close testnet evidence modal"
              className="p-1.5 rounded-pill hover:bg-hairline text-muted-strong hover:text-ink transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 pt-3 border-b border-hairline bg-canvas flex items-center justify-between gap-2 overflow-x-auto shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("milestones")}
              data-testid="tab-milestones"
              className={`pb-2.5 text-xs font-semibold border-b-2 transition-all ${
                activeTab === "milestones"
                  ? "border-brand text-brand"
                  : "border-transparent text-muted-strong hover:text-ink"
              }`}
            >
              Key Transaction Proofs (10)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("contracts")}
              data-testid="tab-contracts"
              className={`pb-2.5 text-xs font-semibold border-b-2 transition-all ${
                activeTab === "contracts"
                  ? "border-brand text-brand"
                  : "border-transparent text-muted-strong hover:text-ink"
              }`}
            >
              6 Deployed Smart Contracts
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              data-testid="tab-all-txs"
              className={`pb-2.5 text-xs font-semibold border-b-2 transition-all ${
                activeTab === "all"
                  ? "border-brand text-brand"
                  : "border-transparent text-muted-strong hover:text-ink"
              }`}
            >
              All Recorded Transactions ({arbitrumSepoliaDeployment.allTransactions.length})
            </button>
          </div>

          <div className="text-[11px] font-mono text-muted-strong hidden md:block pb-2">
            Target Chain: <span className="font-semibold text-ink">421614</span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: Key Transaction Proofs */}
          {activeTab === "milestones" && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-surface-soft border border-hairline text-xs flex items-center justify-between">
                <span className="text-muted-strong">
                  Empirically executed and verified on L2 testnet. Click any transaction chip or explorer button to view on Arbiscan.
                </span>
                <span className="font-mono text-brand font-semibold hidden sm:inline">
                  Chain {ARBITRUM_SEPOLIA_CHAIN_ID}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {keyProofs.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-surface border border-hairline hover:border-brand/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-pill text-[10px] font-bold border ${item.tagColor}`}>
                          {item.tag}
                        </span>
                        <span className="font-heading font-bold text-sm text-ink">
                          {item.title}
                        </span>
                        <span className="text-xs font-mono text-muted-strong">
                          ({item.action})
                        </span>
                      </div>
                      <p className="text-xs text-muted font-sans">
                        {item.notes} · Block <span className="font-mono font-medium">{item.block}</span> · Gas: <span className="font-mono font-medium">{item.gasUsed}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <HashChip hash={item.txHash} type="tx" truncateLen={4} />
                      <a
                        href={item.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill text-xs font-semibold bg-brand/10 hover:bg-brand/20 border border-brand/30 text-brand dark:text-brand-soft transition-colors"
                        title="Open transaction on block explorer"
                      >
                        <span>Arbiscan</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: 6 Deployed Smart Contracts */}
          {activeTab === "contracts" && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-surface-soft border border-hairline text-xs text-muted-strong">
                The 6 deployed core contracts on {arbitrumSepoliaDeployment.chainName}. NatSpec documented, immutably bound, and verified.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {contractsList.map((c) => {
                  const Icon = c.icon;
                  return (
                    <div
                      key={c.name}
                      className="p-4 rounded-xl bg-surface border border-hairline hover:border-brand/40 transition-all flex flex-col justify-between gap-3 shadow-sm"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 rounded-lg bg-brand/10 text-brand">
                            <Icon className="w-4 h-4" />
                          </span>
                          <span className="font-heading font-bold text-sm text-ink">
                            {c.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-strong font-sans">
                          {c.desc}
                        </p>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-hairline">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-muted text-[11px]">Address:</span>
                          <HashChip hash={c.detail.address} type="address" truncateLen={5} />
                        </div>
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-muted text-[11px]">Deploy Tx:</span>
                          <HashChip hash={c.detail.deployTxHash} type="tx" truncateLen={4} />
                        </div>
                        <div className="pt-1 flex items-center justify-end">
                          <a
                            href={c.detail.explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                          >
                            <span>View Contract on Arbiscan</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: All Recorded Transactions */}
          {activeTab === "all" && (
            <div className="space-y-2">
              <div className="p-3 rounded-lg bg-surface-soft border border-hairline text-xs text-muted-strong">
                All {arbitrumSepoliaDeployment.allTransactions.length} recorded on-chain CREATE and CALL transactions logged in the testnet deployment manifest.
              </div>

              <div className="border border-hairline rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-soft border-b border-hairline text-muted-strong uppercase font-mono text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Contract / Action</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Transaction Hash</th>
                      <th className="py-2.5 px-3 text-right">Arbiscan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline bg-surface font-mono">
                    {arbitrumSepoliaDeployment.allTransactions.map((tx, idx) => (
                      <tr key={idx} className="hover:bg-surface-soft/60 transition-colors">
                        <td className="py-2 px-3 font-medium text-ink font-sans">
                          {tx.contract || "Stake / Quorum Action"}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              tx.type === "CREATE"
                                ? "bg-purple-500/10 text-purple-700 dark:text-purple-300"
                                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            }`}
                          >
                            {tx.type || "CALL"}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <HashChip hash={tx.transactionHash} type="tx" truncateLen={4} />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <a
                            href={tx.explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded hover:bg-hairline text-brand inline-flex items-center"
                            title="Open on Arbiscan"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-hairline bg-surface-soft flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0 text-xs">
          <div className="flex items-center gap-1.5 text-muted-strong font-mono">
            <span>Operator:</span>
            <HashChip hash={arbitrumSepoliaDeployment.admin} type="address" truncateLen={4} />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-muted-strong font-sans">
              Verified L2 Testnet Deployment
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 rounded-pill bg-ink text-white dark:bg-white dark:text-black font-semibold text-xs transition-opacity hover:opacity-90"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
