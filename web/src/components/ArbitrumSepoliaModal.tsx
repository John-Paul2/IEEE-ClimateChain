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
      desc: "ECDSA pubkey registration & cryptographic identity authorization for CEMS hardware",
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
      desc: "Period-end EU CBAM compliant attestation certificate registry linking verified Merkle roots",
      icon: FileCheck2,
      detail: arbitrumSepoliaDeployment.contractsDetail.Attestation,
    },
  ];

  const keyProofs = [
    {
      title: "Honest Batch #4 Anchored",
      action: "BatchAnchor.anchorBatch",
      tag: "HONEST FLOW",
      tagColor: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30",
      txHash: arbitrumSepoliaDeployment.keyTransactions.anchorBatchHonest4.txHash,
      explorerUrl: arbitrumSepoliaDeployment.keyTransactions.anchorBatchHonest4.explorerUrl,
      gasUsed: "179,843",
      block: "321582952",
      notes: "Authentic CAMPD telemetry Merkle root anchored on Arbitrum Sepolia",
    },
    {
      title: "EU CBAM Attestation Certificate #4",
      action: "Attestation.recordAttestation",
      tag: "BUYER PROOF",
      tagColor: "bg-blue-500/10 text-blue-800 dark:text-blue-300 border-blue-500/30",
      txHash: arbitrumSepoliaDeployment.keyTransactions.recordAttestation.txHash,
      explorerUrl: arbitrumSepoliaDeployment.keyTransactions.recordAttestation.explorerUrl,
      gasUsed: "281,626",
      block: "321583085",
      notes: "On-chain record created after 3-of-5 quorum consensus verified",
    },
    {
      title: "Tampered Batch #6 Anchored (Attack Injection)",
      action: "BatchAnchor.anchorBatch",
      tag: "ATTACK INJECTED",
      tagColor: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30",
      txHash: arbitrumSepoliaDeployment.keyTransactions.anchorBatchTampered6.txHash,
      explorerUrl: arbitrumSepoliaDeployment.keyTransactions.anchorBatchTampered6.explorerUrl,
      gasUsed: "179,843",
      block: "321584995",
      notes: "Synthetic scale reduction attack anchored by rogue operator",
    },
    {
      title: "Slashing Resolution (Arbiter Council 2-of-3)",
      action: "Challenge.resolve",
      tag: "SLASH EXECUTED",
      tagColor: "bg-red-500/10 text-red-800 dark:text-red-300 border-red-500/30",
      txHash: arbitrumSepoliaDeployment.keyTransactions.resolveSlash.txHash,
      explorerUrl: arbitrumSepoliaDeployment.keyTransactions.resolveSlash.explorerUrl,
      gasUsed: "318,914",
      block: "321585388",
      notes: "Arbiter 1 completed 2-of-3 quorum: Slashed 50% operator bond on Arbitrum Sepolia",
    },
    {
      title: "CEMS Hardware Device Registered",
      action: "DeviceRegistry.registerDevice",
      tag: "REGISTRATION",
      tagColor: "bg-slate-500/10 text-slate-800 dark:text-slate-300 border-slate-500/30",
      txHash: arbitrumSepoliaDeployment.keyTransactions.registerDevice.txHash,
      explorerUrl: arbitrumSepoliaDeployment.keyTransactions.registerDevice.explorerUrl,
      gasUsed: "238,041",
      block: "321580773",
      notes: "Device public key registered with factory installation ID",
    },
    {
      title: "Operator Bond Escrowed",
      action: "BondVault.depositOperatorBond",
      tag: "COLLATERAL",
      tagColor: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30",
      txHash: arbitrumSepoliaDeployment.keyTransactions.depositOperatorBond.txHash,
      explorerUrl: arbitrumSepoliaDeployment.keyTransactions.depositOperatorBond.explorerUrl,
      gasUsed: "117,845",
      block: "321580907",
      notes: "Operator deposited 0.002 ETH bond required for telemetry anchoring",
    },
    {
      title: "Quorum Clean Reveal (Honest V0)",
      action: "VerifierQuorum.revealVote",
      tag: "CONSENSUS",
      tagColor: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30",
      txHash: arbitrumSepoliaDeployment.keyTransactions.revealVoteHonestV0.txHash,
      explorerUrl: arbitrumSepoliaDeployment.keyTransactions.revealVoteHonestV0.explorerUrl,
      gasUsed: "194,083",
      block: "321583050",
      notes: "Verifier 0 revealed Clean verdict with 0bp anomaly score",
    },
    {
      title: "Quorum Fraud Reveal (Attack V0)",
      action: "VerifierQuorum.revealVote",
      tag: "FRAUD DETECTED",
      tagColor: "bg-red-500/10 text-red-800 dark:text-red-300 border-red-500/30",
      txHash: arbitrumSepoliaDeployment.keyTransactions.revealVoteAttackV0.txHash,
      explorerUrl: arbitrumSepoliaDeployment.keyTransactions.revealVoteAttackV0.explorerUrl,
      gasUsed: "194,605",
      block: "321585097",
      notes: "Verifier 0 revealed Fraud with score=8500bp & physics residual mismatch",
    },
    {
      title: "Operator Dispute Lodged",
      action: "Challenge.submitOperatorDispute",
      tag: "DISPUTE",
      tagColor: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30",
      txHash: arbitrumSepoliaDeployment.keyTransactions.submitOperatorDispute.txHash,
      explorerUrl: arbitrumSepoliaDeployment.keyTransactions.submitOperatorDispute.explorerUrl,
      gasUsed: "82,020",
      block: "321585333",
      notes: "Operator lodged dispute providing Merkle proof to initiate Arbiter review",
    },
    {
      title: "Arbiter 0 Fraud Vote",
      action: "Challenge.resolve",
      tag: "ARBITER VOTE",
      tagColor: "bg-red-500/10 text-red-800 dark:text-red-300 border-red-500/30",
      txHash: arbitrumSepoliaDeployment.keyTransactions.resolveVote.txHash,
      explorerUrl: arbitrumSepoliaDeployment.keyTransactions.resolveVote.explorerUrl,
      gasUsed: "77,704",
      block: "321585379",
      notes: "Arbiter 0 cast 1st vote confirming UPHELD_FRAUD verdict",
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
                Live Arbitrum Sepolia Deployment (Chain {ARBITRUM_SEPOLIA_CHAIN_ID})
              </h2>
              <span className="px-2 py-0.5 rounded-pill text-[11px] font-semibold font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300">
                LIVE TESTNET
              </span>
            </div>
            <p className="text-xs text-muted-strong font-sans">
              All 6 VeriCEMS smart contracts and full lifecycle on-chain fraud challenge transaction proofs deployed to Arbitrum Sepolia.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={ARBITRUM_SEPOLIA_EXPLORER_BASE}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-pill text-xs font-semibold bg-surface hover:bg-hairline border border-hairline text-ink transition-colors"
            >
              <span>sepolia.arbiscan.io</span>
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
                  Empirically executed and verified on Arbitrum Sepolia testnet. Click any transaction chip or explorer button to view on Arbiscan.
                </span>
                <span className="font-mono text-brand font-semibold hidden sm:inline">
                  Chain 421614
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
                        title="Open transaction on sepolia.arbiscan.io"
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
                The 6 deployed core contracts on Arbitrum Sepolia. NatSpec documented, immutably bound, and verified.
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
                All {arbitrumSepoliaDeployment.allTransactions.length} recorded on-chain CREATE and CALL transactions logged in <code className="font-mono text-brand">deployments/testnet.json</code>.
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
              Documentation: <a href="file:///docs/TESTNET_EVIDENCE.md" className="text-brand hover:underline font-mono">docs/TESTNET_EVIDENCE.md</a>
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
