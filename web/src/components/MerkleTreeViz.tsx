import React, { useState, useMemo } from "react";
import { Copy, ExternalLink, ShieldCheck, ShieldAlert, Check } from "lucide-react";
import { keccak256, stringToBytes } from "viem";
import { Skeleton } from "./Skeleton";
import { ErrorState } from "./ErrorState";
import { deploymentConfig } from "../chain/deploymentConfig.ts";

export interface MerkleTreeVizProps {
  rootHash?: string | null;
  leaves?: string[];
  packetsCount?: number;
  totalExpected?: number;
  batchId?: number;
  txHash?: string | null;
  batchStatus?: string;
  flaggedLeafIndex?: number | null;
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
  isLoading = false,
  isEmpty = false,
  error = null,
  onRetry,
  className = "",
}) => {
  const [copied, setCopied] = useState(false);
  const [activeHash, setActiveHash] = useState<string | null>(null);

  const defaultRoot =
    rootHash ||
    deploymentConfig.contracts.BatchAnchor;

  const isQuarantined = batchStatus === "Quarantined" || batchStatus === "Slashed";

  // Deterministic 8 leaves
  const effectiveLeaves = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < 8; i++) {
      out.push(leaves[i] || keccak256(stringToBytes(`packet-${i}`)));
    }
    return out;
  }, [leaves]);

  // Intermediate node hashes (pseudo deterministic)
  const treeNodes = useMemo(() => {
    const nodes: TreeNode[] = [];

    // Flagged leaf resolution: if explicitly given or batch is quarantined, flag leaf 3 (or specified index)
    const activeFlaggedIdx =
      flaggedLeafIndex !== undefined && flaggedLeafIndex !== null
        ? flaggedLeafIndex
        : isQuarantined
        ? 3
        : -1;

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
        label: `L${i}`,
      });
    }

    // Level 1: 4 branch nodes (midpoints of child pairs)
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
        label: `H${i * 2},${i * 2 + 1}`,
      });
    }

    // Level 2: 2 branch nodes (midpoints of l1 pairs)
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
        label: `H${i * 4}-${i * 4 + 3}`,
      });
    }

    // Level 3: Root node (center 400)
    nodes.push({
      id: "root",
      hash: defaultRoot,
      shortHash: defaultRoot.slice(0, 6),
      x: 400,
      y: 12,
      width: 104,
      height: 26,
      level: 3,
      isRoot: true,
      label: "ROOT",
    });

    return nodes;
  }, [defaultRoot, effectiveLeaves, flaggedLeafIndex, isQuarantined]);

  const handleCopyRoot = () => {
    navigator.clipboard.writeText(defaultRoot);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const explorerBase = deploymentConfig.explorerBaseUrl;
  const explorerUrl = explorerBase
    ? (txHash
        ? `${explorerBase}/tx/${txHash}`
        : `${explorerBase}/search?q=${defaultRoot}`)
    : undefined;

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

  return (
    <div
      role="region"
      aria-label="Batch Merkle Tree Visualization"
      className={`p-5 rounded-card bg-surface border border-hairline shadow-card space-y-3 ${className}`}
    >
      {/* Header Chips Strip: ROOT, Copy, Explorer */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-hairline text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-xs text-ink flex items-center gap-1.5">
            {isQuarantined ? (
              <ShieldAlert className="w-4 h-4 text-brand" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            )}
            Batch #{batchId} Root
          </span>
          <span className="font-mono text-[11px] text-muted-strong bg-surface-soft px-2 py-0.5 rounded-chip border border-hairline">
            {defaultRoot.slice(0, 10)}…{defaultRoot.slice(-6)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="merkle-root-copy-btn"
            onClick={handleCopyRoot}
            aria-label="Copy full Merkle root hash"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-chip text-xs bg-surface-soft hover:bg-hairline border border-hairline text-ink transition-colors font-medium shadow-sm"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-600" />
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
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-chip text-xs bg-surface-soft hover:bg-hairline border border-hairline text-ink transition-colors font-medium shadow-sm"
          >
            <ExternalLink className="w-3 h-3 text-muted-strong" />
            <span>Explorer</span>
          </a>
        </div>
      </div>

      {/* Selected/Hovered Node Hash Readout (Accessible for keyboard & hover) */}
      <div
        data-testid="merkle-tree-hash-readout"
        className="px-3 py-1.5 rounded-chip bg-surface-soft border border-hairline flex items-center justify-between text-xs font-mono"
      >
        <span className="text-muted-strong font-sans text-[11px]">Hover/Focus Hash:</span>
        <span className="text-ink font-semibold truncate ml-2 max-w-[280px] sm:max-w-md select-all">
          {displayedHash}
        </span>
      </div>

      {/* Responsive Custom SVG Tree (8 leaves, 3 levels, responsive viewBox, no zoom/controls) */}
      <div className="w-full overflow-hidden flex items-center justify-center pt-1">
        <svg
          viewBox="0 0 800 225"
          className="w-full h-auto max-w-full"
          role="img"
          aria-label={`Merkle Tree with 8 leaves anchored under root ${defaultRoot.slice(0, 10)}`}
        >
          <g>
            {/* Edges from Root to Level 2 (1px hairline) */}
            <line x1={400} y1={38} x2={205} y2={72} stroke="var(--hairline, #E5E7EB)" strokeWidth="1" />
            <line x1={400} y1={38} x2={595} y2={72} stroke="var(--hairline, #E5E7EB)" strokeWidth="1" />

            {/* Edges from Level 2 to Level 1 */}
            <line x1={205} y1={96} x2={115} y2={132} stroke="var(--hairline, #E5E7EB)" strokeWidth="1" />
            <line x1={205} y1={96} x2={295} y2={132} stroke="var(--hairline, #E5E7EB)" strokeWidth="1" />
            <line x1={595} y1={96} x2={505} y2={132} stroke="var(--hairline, #E5E7EB)" strokeWidth="1" />
            <line x1={595} y1={96} x2={685} y2={132} stroke="var(--hairline, #E5E7EB)" strokeWidth="1" />

            {/* Edges from Level 1 to Level 0 Leaves */}
            <line x1={115} y1={156} x2={70} y2={192} stroke="var(--hairline, #E5E7EB)" strokeWidth="1" />
            <line x1={115} y1={156} x2={160} y2={192} stroke="var(--hairline, #E5E7EB)" strokeWidth="1" />
            <line x1={295} y1={156} x2={250} y2={192} stroke="var(--hairline, #E5E7EB)" strokeWidth="1" />
            <line x1={295} y1={156} x2={340} y2={192} stroke="var(--hairline, #E5E7EB)" strokeWidth="1" />
            <line x1={505} y1={156} x2={460} y2={192} stroke="var(--hairline, #E5E7EB)" strokeWidth="1" />
            <line x1={505} y1={156} x2={550} y2={192} stroke="var(--hairline, #E5E7EB)" strokeWidth="1" />
            <line x1={685} y1={156} x2={640} y2={192} stroke="var(--hairline, #E5E7EB)" strokeWidth="1" />
            <line x1={685} y1={156} x2={730} y2={192} stroke="var(--hairline, #E5E7EB)" strokeWidth="1" />
          </g>

          {/* Nodes */}
          {treeNodes.map((node) => {
            const rx = node.x - node.width / 2;
            const ry = node.y;
            const isHovered = activeHash === node.hash;

            // Flagged leaf styling: fraud chip colors (--flagged-bg: #FDECEC, --flagged-ink: #9B1C1C)
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
                    fill="var(--flagged-bg, #FDECEC)"
                    stroke="var(--flagged-ink, #9B1C1C)"
                    strokeWidth={isHovered ? 2.5 : 1.5}
                  />
                  <text
                    x={node.x}
                    y={node.y + node.height / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="var(--flagged-ink, #9B1C1C)"
                    fontFamily="JetBrains Mono, monospace"
                    fontSize={10}
                    fontWeight={700}
                  >
                    {node.shortHash}
                  </text>
                </g>
              );
            }

            // Root Node styling: brand-red outline + "ROOT" label
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
                    fill="var(--surface-card, #FFFFFF)"
                    stroke="var(--brand, #E5383B)"
                    strokeWidth={isHovered ? 3 : 2}
                  />
                  <text
                    x={node.x}
                    y={node.y + node.height / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="var(--ink, #0A0A0A)"
                    fontFamily="JetBrains Mono, monospace"
                    fontSize={10}
                    fontWeight={700}
                  >
                    ROOT · {node.shortHash}
                  </text>
                </g>
              );
            }

            // Intermediate branch or clean leaf node
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
                  fill="var(--surface-card, #FFFFFF)"
                  stroke={isHovered ? "var(--brand, #E5383B)" : "var(--hairline, #E5E7EB)"}
                  strokeWidth={isHovered ? 2 : 1}
                />
                <text
                  x={node.x}
                  y={node.y + node.height / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="var(--ink, #0A0A0A)"
                  fontFamily="JetBrains Mono, monospace"
                  fontSize={10}
                  fontWeight={500}
                >
                  {node.shortHash}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
