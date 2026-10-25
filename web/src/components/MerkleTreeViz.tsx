import React, { useState, useMemo, useEffect } from "react";
import { Copy, ExternalLink, ShieldCheck, ShieldAlert, Check, ChevronDown, Network, X } from "lucide-react";
import { motion } from "framer-motion";
import { keccak256, stringToBytes } from "viem";
import { Skeleton } from "./Skeleton";
import { ErrorState } from "./ErrorState";
import { HashChip } from "./HashChip";
import { deploymentConfig } from "../chain/deploymentConfig.ts";
import { buildMerkleTree } from "../lib/merkle";

export interface MerkleTreeVizProps {
  rootHash?: string | null;
  leaves?: string[];
  packetsCount?: number;
  totalExpected?: number;
  batchId?: number;
  txHash?: string | null;
  batchStatus?: string;
  flaggedLeafIndex?: number | null;
  selectedLeafIndex?: number | null;
  tamperedLeafIndex?: number | null;
  tamperedLeafHash?: string | null;
  onClearSelectedLeaf?: () => void;
  isCollapsible?: boolean;
  defaultOpen?: boolean;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

interface TreeNode {
  id: string;
  hash: string;
  shortHash: string;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
  isRoot?: boolean;
  isFlagged?: boolean;
  isOnProofPath?: boolean;
  isSibling?: boolean;
  label?: string;
}

export const MerkleTreeViz: React.FC<MerkleTreeVizProps> = ({
  rootHash,
  leaves = [],
  packetsCount: _packetsCount,
  totalExpected: _totalExpected = 8,
  batchId = 1,
  txHash,
  batchStatus = "Anchored",
  flaggedLeafIndex,
  selectedLeafIndex = null,
  tamperedLeafIndex = null,
  tamperedLeafHash = null,
  onClearSelectedLeaf,
  isCollapsible = false,
  defaultOpen = true,
  isLoading = false,
  isEmpty = false,
  error = null,
  onRetry,
  className = "",
}) => {
  const [copied, setCopied] = useState(false);
  const [activeHash, setActiveHash] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultOpen);

  // Auto-expand whenever a leaf is selected or tampered so the user always sees the Merkle tree
  useEffect(() => {
    if (selectedLeafIndex !== null || tamperedLeafIndex !== null) {
      setIsExpanded(true);
    }
  }, [selectedLeafIndex, tamperedLeafIndex]);

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const defaultRoot = rootHash || deploymentConfig.contracts.BatchAnchor;

  const isQuarantined =
    batchStatus === "Quarantined" ||
    batchStatus === "Slashed" ||
    tamperedLeafIndex !== null;

  // Deterministic 8 leaves (incorporating tamperedLeafHash if edited)
  const effectiveLeaves = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < 8; i++) {
      if (tamperedLeafIndex !== null && ((tamperedLeafIndex % 8) + 8) % 8 === i && tamperedLeafHash) {
        out.push(tamperedLeafHash);
      } else {
        out.push(leaves[i] || keccak256(stringToBytes(`packet-${i}`)));
      }
    }
    return out;
  }, [leaves, tamperedLeafIndex, tamperedLeafHash]);

  // Merkle tree proof computation
  const merkleTreeData = useMemo(() => {
    try {
      return buildMerkleTree(effectiveLeaves);
    } catch {
      return null;
    }
  }, [effectiveLeaves]);

  // Leaf index normalized to 0..7
  const activeLeafIdx =
    selectedLeafIndex !== null && selectedLeafIndex !== undefined
      ? ((selectedLeafIndex % 8) + 8) % 8
      : tamperedLeafIndex !== null && tamperedLeafIndex !== undefined
      ? ((tamperedLeafIndex % 8) + 8) % 8
      : null;

  // Selected proof siblings
  const activeProof =
    activeLeafIdx !== null && merkleTreeData?.proofs?.[activeLeafIdx]
      ? merkleTreeData.proofs[activeLeafIdx]
      : null;

  const treeNodes = useMemo(() => {
    const nodes: TreeNode[] = [];

    const activeFlaggedIdx =
      tamperedLeafIndex !== undefined && tamperedLeafIndex !== null
        ? ((tamperedLeafIndex % 8) + 8) % 8
        : flaggedLeafIndex !== undefined && flaggedLeafIndex !== null
        ? flaggedLeafIndex
        : batchStatus === "Quarantined" || batchStatus === "Slashed"
        ? 3
        : -1;

    const p1Idx = activeLeafIdx !== null ? Math.floor(activeLeafIdx / 2) : -1;
    const p2Idx = p1Idx !== -1 ? Math.floor(p1Idx / 2) : -1;
    const s0Idx = activeLeafIdx !== null ? activeLeafIdx ^ 1 : -1;
    const s1Idx = p1Idx !== -1 ? p1Idx ^ 1 : -1;
    const s2Idx = p2Idx !== -1 ? p2Idx ^ 1 : -1;

    // Level 0: 8 leaves
    const leafX = [70, 160, 250, 340, 460, 550, 640, 730];
    const l0Hashes = effectiveLeaves;

    for (let i = 0; i < 8; i++) {
      const h = l0Hashes[i];
      nodes.push({
        id: `leaf-${i}`,
        hash: h,
        shortHash: h.slice(0, 6),
        x: leafX[i],
        y: 192,
        width: 70,
        height: 24,
        level: 0,
        isFlagged: i === activeFlaggedIdx,
        isOnProofPath: i === activeLeafIdx,
        isSibling: i === s0Idx,
        label: `L${i}`,
      });
    }

    // Level 1: 4 branch nodes
    const l1X = [115, 295, 505, 685];
    const l1Hashes = [0, 1, 2, 3].map((i) =>
      keccak256(stringToBytes(effectiveLeaves[i * 2] + effectiveLeaves[i * 2 + 1]))
    );

    for (let i = 0; i < 4; i++) {
      const h = l1Hashes[i];
      nodes.push({
        id: `branch-1-${i}`,
        hash: h,
        shortHash: h.slice(0, 6),
        x: l1X[i],
        y: 132,
        width: 74,
        height: 24,
        level: 1,
        isOnProofPath: i === p1Idx,
        isSibling: i === s1Idx,
        label: `H${i * 2},${i * 2 + 1}`,
      });
    }

    // Level 2: 2 branch nodes
    const l2X = [205, 595];
    const l2Hashes = [0, 1].map((i) =>
      keccak256(stringToBytes(l1Hashes[i * 2] + l1Hashes[i * 2 + 1]))
    );

    for (let i = 0; i < 2; i++) {
      const h = l2Hashes[i];
      nodes.push({
        id: `branch-2-${i}`,
        hash: h,
        shortHash: h.slice(0, 6),
        x: l2X[i],
        y: 72,
        width: 78,
        height: 24,
        level: 2,
        isOnProofPath: i === p2Idx,
        isSibling: i === s2Idx,
        label: `H${i * 4}-${i * 4 + 3}`,
      });
    }

    // Level 3: Root node
    nodes.push({
      id: "root",
      hash: defaultRoot,
      shortHash: defaultRoot.slice(0, 6),
      x: 400,
      y: 12,
      width: 112,
      height: 26,
      level: 3,
      isRoot: true,
      isOnProofPath: activeLeafIdx !== null,
      label: "ROOT",
    });

    return nodes;
  }, [defaultRoot, effectiveLeaves, flaggedLeafIndex, batchStatus, activeLeafIdx, tamperedLeafIndex]);

  const handleCopyRoot = () => {
    navigator.clipboard.writeText(defaultRoot);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const explorerBase = deploymentConfig.explorerBaseUrl;
  const explorerUrl = explorerBase
    ? txHash
      ? `${explorerBase}/tx/${txHash}`
      : `${explorerBase}/search?q=${defaultRoot}`
    : undefined;

  const proofPathD = useMemo(() => {
    if (activeLeafIdx === null) return null;
    const leafX = [70, 160, 250, 340, 460, 550, 640, 730];
    const l1X = [115, 295, 505, 685];
    const l2X = [205, 595];

    const p1Idx = Math.floor(activeLeafIdx / 2);
    const p2Idx = Math.floor(p1Idx / 2);

    const x0 = leafX[activeLeafIdx];
    const y0 = 192;
    const x1 = l1X[p1Idx];
    const y1 = 132;
    const x2 = l2X[p2Idx];
    const y2 = 72;
    const x3 = 400;
    const y3 = 38;

    return `M ${x0} ${y0} L ${x1} ${y1 + 24} M ${x1} ${y1} L ${x2} ${y2 + 24} M ${x2} ${y2} L ${x3} ${y3}`;
  }, [activeLeafIdx]);

  if (isLoading) {
    return (
      <div className={`p-5 rounded-card bg-surface border border-hairline shadow-card space-y-4 ${className}`}>
        <Skeleton className="h-6 w-48 rounded-md" />
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-5 rounded-card bg-surface border border-hairline shadow-card ${className}`}>
        <ErrorState title="Merkle Tree Error" message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (isEmpty) {
    return null;
  }

  const displayedHash = activeHash || defaultRoot;
  const isTamperedTree = tamperedLeafIndex !== null;

  return (
    <div
      role="region"
      aria-label="Batch Merkle Tree Visualization"
      className={`p-5 rounded-card bg-surface border transition-colors shadow-card space-y-3 ${
        isTamperedTree ? "border-brand/60" : "border-hairline"
      } ${className}`}
    >
      {/* Header Chips Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-hairline text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-heading font-bold text-sm text-ink flex items-center gap-1.5">
            {isQuarantined ? (
              <ShieldAlert className="w-4 h-4 text-brand" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-verified" />
            )}
            Batch #{batchId} Merkle Tree
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-pill bg-brand/10 text-brand font-semibold">
            Browser demo
          </span>
          <span
            className={`font-mono text-[11px] px-2.5 py-0.5 rounded-pill border ${
              isTamperedTree
                ? "bg-flagged-bg text-flagged-ink border-brand/40 font-bold"
                : "bg-surface-soft text-muted-strong border-hairline"
            }`}
          >
            {isTamperedTree
              ? "Root Mismatch (Tampered)"
              : `${defaultRoot.slice(0, 10)}…${defaultRoot.slice(-6)}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="merkle-root-copy-btn"
            onClick={handleCopyRoot}
            aria-label="Copy full Merkle root hash"
            className="inline-flex items-center gap-1 px-3 py-1 rounded-pill text-xs bg-surface-soft hover:bg-hairline border border-hairline text-ink transition-colors font-medium cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-verified" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-muted-strong" />
                <span>Copy</span>
              </>
            )}
          </button>

          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="merkle-root-explorer-link"
            aria-label="View Merkle root on block explorer"
            className="inline-flex items-center gap-1 px-3 py-1 rounded-pill text-xs bg-surface-soft hover:bg-hairline border border-hairline text-ink transition-colors font-medium"
          >
            <ExternalLink className="w-3 h-3 text-muted-strong" />
            <span>Explorer</span>
          </a>

          {isCollapsible && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? "Collapse Merkle tree" : "Expand Merkle tree"}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill text-xs bg-surface-soft hover:bg-hairline border border-hairline text-muted-strong hover:text-ink transition-colors cursor-pointer"
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  isExpanded ? "rotate-180" : ""
                }`}
              />
              <span>{isExpanded ? "Collapse" : "Expand"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tampered Alert Banner inside Merkle Tree */}
      {isTamperedTree && (
        <div className="p-3 rounded-xl bg-flagged-bg border border-brand/40 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-flagged-ink font-medium">
            <ShieldAlert className="w-4 h-4 text-brand shrink-0" />
            <span>
              <strong>Tamper Propagated to Root:</strong> Editing Leaf L{activeLeafIdx} changed its hash and every parent branch above it, so the recomputed root no longer matches the blockchain!
            </span>
          </div>
        </div>
      )}

      {/* Packet Inspector Sibling Hashes Panel */}
      {activeLeafIdx !== null && activeProof && (
        <div className="p-3.5 bg-surface-soft border border-hairline rounded-xl text-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-brand" />
              <span className="font-heading font-bold text-ink">
                Packet Inspector: Proof Path for Leaf #{activeLeafIdx}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-pill bg-brand/10 text-brand font-semibold">
                Browser demo
              </span>
            </div>
            {onClearSelectedLeaf && (
              <button
                type="button"
                onClick={onClearSelectedLeaf}
                className="text-muted-strong hover:text-ink p-1 cursor-pointer"
                title="Clear selected proof"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <p className="text-[11px] text-muted-strong">
            3 sibling hashes required to reconstruct the Merkle root on-chain:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
            {activeProof.siblings.map((sib, sIdx) => (
              <div key={sIdx} className="p-2 bg-surface border border-hairline rounded-lg flex flex-col gap-1">
                <span className="text-[10px] text-muted uppercase font-sans font-medium">
                  Sibling {sIdx + 1} (Level {sIdx})
                </span>
                <HashChip hash={sib} truncateLen={6} />
              </div>
            ))}
          </div>
        </div>
      )}

      {(!isCollapsible || isExpanded) && (
        <>
          <div
            data-testid="merkle-tree-hash-readout"
            className="px-3 py-1.5 rounded-pill bg-surface-soft border border-hairline flex items-center justify-between text-xs font-mono"
          >
            <span className="text-muted-strong font-sans text-[11px]">Selected node fingerprint:</span>
            <span className="text-ink font-semibold truncate ml-2 max-w-[280px] sm:max-w-md select-all">
              {displayedHash}
            </span>
          </div>

          <div className="w-full overflow-hidden flex items-center justify-center pt-1">
            <svg
              viewBox="0 0 800 225"
              className="w-full h-auto max-w-full"
              role="img"
              aria-label={`Merkle Tree with 8 leaves anchored under root ${defaultRoot.slice(0, 10)}`}
            >
              <g>
                {/* Edges from Root to Level 2 */}
                <line x1={400} y1={38} x2={205} y2={72} stroke="var(--hairline-strong, #38383D)" strokeWidth="1.2" />
                <line x1={400} y1={38} x2={595} y2={72} stroke="var(--hairline-strong, #38383D)" strokeWidth="1.2" />

                {/* Edges from Level 2 to Level 1 */}
                <line x1={205} y1={96} x2={115} y2={132} stroke="var(--hairline-strong, #38383D)" strokeWidth="1.2" />
                <line x1={205} y1={96} x2={295} y2={132} stroke="var(--hairline-strong, #38383D)" strokeWidth="1.2" />
                <line x1={595} y1={96} x2={505} y2={132} stroke="var(--hairline-strong, #38383D)" strokeWidth="1.2" />
                <line x1={595} y1={96} x2={685} y2={132} stroke="var(--hairline-strong, #38383D)" strokeWidth="1.2" />

                {/* Edges from Level 1 to Level 0 Leaves */}
                <line x1={115} y1={156} x2={70} y2={192} stroke="var(--hairline-strong, #38383D)" strokeWidth="1.2" />
                <line x1={115} y1={156} x2={160} y2={192} stroke="var(--hairline-strong, #38383D)" strokeWidth="1.2" />
                <line x1={295} y1={156} x2={250} y2={192} stroke="var(--hairline-strong, #38383D)" strokeWidth="1.2" />
                <line x1={295} y1={156} x2={340} y2={192} stroke="var(--hairline-strong, #38383D)" strokeWidth="1.2" />
                <line x1={505} y1={156} x2={460} y2={192} stroke="var(--hairline-strong, #38383D)" strokeWidth="1.2" />
                <line x1={505} y1={156} x2={550} y2={192} stroke="var(--hairline-strong, #38383D)" strokeWidth="1.2" />
                <line x1={685} y1={156} x2={640} y2={192} stroke="var(--hairline-strong, #38383D)" strokeWidth="1.2" />
                <line x1={685} y1={156} x2={730} y2={192} stroke="var(--hairline-strong, #38383D)" strokeWidth="1.2" />
              </g>

              {/* Animated Proof Path Line (400 ms) */}
              {proofPathD && (
                <motion.path
                  key={`proof-path-${activeLeafIdx}-${isTamperedTree}`}
                  d={proofPathD}
                  fill="none"
                  stroke="var(--brand, #E5383B)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={isTamperedTree ? "6 4" : "400"}
                  initial={prefersReducedMotion ? false : { strokeDashoffset: 400 }}
                  animate={{ strokeDashoffset: 0 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.4, ease: "easeOut" }}
                />
              )}

              {/* Nodes */}
              {treeNodes.map((node) => {
                const rx = node.x - node.width / 2;
                const ry = node.y;
                const isHovered = activeHash === node.hash;
                const isOnPath = node.isOnProofPath;
                const isSib = node.isSibling;

                if (node.isFlagged) {
                  return (
                    <g
                      key={node.id}
                      data-testid={`merkle-node-${node.id}`}
                      tabIndex={0}
                      role="button"
                      aria-label={`Flagged Leaf ${node.label}: ${node.hash}`}
                      onMouseEnter={() => setActiveHash(node.hash)}
                      onMouseLeave={() => setActiveHash(null)}
                      onFocus={() => setActiveHash(node.hash)}
                      onBlur={() => setActiveHash(null)}
                      className="cursor-pointer focus:outline-none"
                    >
                      <title>{`Flagged Leaf ${node.hash}`}</title>
                      <rect
                        x={rx}
                        y={ry}
                        width={node.width}
                        height={node.height}
                        rx={6}
                        ry={6}
                        fill="var(--flagged-bg)"
                        stroke="var(--brand, #E5383B)"
                        strokeWidth={isOnPath ? 3 : isHovered ? 2.5 : 1.5}
                      />
                      <text
                        x={node.x}
                        y={node.y + node.height / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="var(--flagged-ink)"
                        fontFamily="JetBrains Mono, monospace"
                        fontSize={10}
                        fontWeight={700}
                      >
                        {node.shortHash}
                      </text>
                    </g>
                  );
                }

                if (node.isRoot) {
                  return (
                    <g
                      key={node.id}
                      data-testid={`merkle-node-${node.id}`}
                      tabIndex={0}
                      role="button"
                      aria-label={`Merkle Root: ${node.hash}`}
                      onMouseEnter={() => setActiveHash(node.hash)}
                      onMouseLeave={() => setActiveHash(null)}
                      onFocus={() => setActiveHash(node.hash)}
                      onBlur={() => setActiveHash(null)}
                      className="cursor-pointer focus:outline-none"
                    >
                      <title>{`ROOT: ${node.hash}`}</title>
                      <rect
                        x={rx}
                        y={ry}
                        width={node.width}
                        height={node.height}
                        rx={6}
                        ry={6}
                        fill={isTamperedTree ? "var(--flagged-bg)" : isOnPath ? "var(--band)" : "var(--surface-soft)"}
                        stroke="var(--brand, #E5383B)"
                        strokeWidth={isOnPath ? 3 : isHovered ? 2.5 : 2}
                      />
                      <text
                        x={node.x}
                        y={node.y + node.height / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={isTamperedTree ? "var(--flagged-ink)" : "var(--ink)"}
                        fontFamily="JetBrains Mono, monospace"
                        fontSize={10}
                        fontWeight={700}
                      >
                        {isTamperedTree ? "MISMATCH" : `ROOT · ${node.shortHash}`}
                      </text>
                    </g>
                  );
                }

                return (
                  <g
                    key={node.id}
                    data-testid={`merkle-node-${node.id}`}
                    tabIndex={0}
                    role="button"
                    aria-label={`Node ${node.label || ""}: ${node.hash}`}
                    onMouseEnter={() => setActiveHash(node.hash)}
                    onMouseLeave={() => setActiveHash(null)}
                    onFocus={() => setActiveHash(node.hash)}
                    onBlur={() => setActiveHash(null)}
                    className="cursor-pointer focus:outline-none"
                  >
                    <title>{node.hash}</title>
                    <rect
                      x={rx}
                      y={ry}
                      width={node.width}
                      height={node.height}
                      rx={6}
                      ry={6}
                      fill={
                        isOnPath
                          ? "var(--flagged-bg)"
                          : isSib
                          ? "rgba(16, 185, 129, 0.14)"
                          : "var(--surface-soft)"
                      }
                      stroke={
                        isOnPath
                          ? "var(--brand, #E5383B)"
                          : isSib
                          ? "#10B981"
                          : isHovered
                          ? "var(--brand, #E5383B)"
                          : "var(--hairline-strong)"
                      }
                      strokeWidth={isOnPath ? 2.5 : isSib ? 2 : isHovered ? 2 : 1}
                    />
                    <text
                      x={node.x}
                      y={node.y + node.height / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={isOnPath ? "var(--flagged-ink)" : isSib ? "#10B981" : "var(--ink)"}
                      fontFamily="JetBrains Mono, monospace"
                      fontSize={10}
                      fontWeight={isOnPath || isSib ? 700 : 500}
                    >
                      {node.shortHash}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </>
      )}
    </div>
  );
};
