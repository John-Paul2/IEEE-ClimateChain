import React, { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  Position,
  MarkerType,
} from "@xyflow/react";
import { GitBranch, ShieldCheck, ExternalLink, Copy, Check, Clock } from "lucide-react";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";

export interface MerkleTreeVizProps {
  rootHash?: string | null;
  leaves?: string[];
  packetsCount?: number;
  totalExpected?: number;
  batchId?: number;
  txHash?: string | null;
  batchStatus?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

export const MerkleTreeViz: React.FC<MerkleTreeVizProps> = ({
  rootHash,
  leaves = [],
  packetsCount,
  totalExpected = 8,
  batchId = 1,
  txHash,
  batchStatus = "Anchored",
  isLoading = false,
  isEmpty = false,
  error = null,
  onRetry,
  className = "",
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine current leaves (up to 8, or defaults)
  const effectiveLeaves = useMemo(() => {
    if (leaves.length > 0) return leaves.slice(0, 8);
    return [
      "0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff",
      "0x2222333344445555666677778888999900001111bbbbccccddddeeeeffffaaaa",
      "0x3333444455556666777788889999000011112222ccccddddeeeeffffaaaabbbb",
      "0x4444555566667777888899990000111122223333ddddeeeeffffaaaabbbbcccc",
    ];
  }, [leaves]);

  const count = packetsCount ?? effectiveLeaves.length;
  const isFilled = count >= totalExpected;
  const isAnchored = Boolean(rootHash && (batchStatus === "Anchored" || batchStatus === "Verified" || batchStatus === "Quarantined"));

  const defaultRoot =
    rootHash ||
    "0x789a42f8c5b9671144177cd390de2ef830026e6d1c815ec6ba9d2424fa75d9e1";

  const explorerUrl = txHash
    ? `https://sepolia.arbiscan.io/tx/${txHash}`
    : `https://sepolia.arbiscan.io/search?q=${defaultRoot}`;

  const formatHash = (h: string) => `${h.slice(0, 6)}...${h.slice(-4)}`;

  const { initialNodes, initialEdges } = useMemo(() => {
    const l0 = effectiveLeaves[0] || "0x00";
    const l1 = effectiveLeaves[1] || "0x00";
    const l2 = effectiveLeaves[2] || "0x00";
    const l3 = effectiveLeaves[3] || "0x00";

    // Branch nodes
    const n01 = "0x89abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567";
    const n23 = "0x9abcdef0123456789abcdef0123456789abcdef0123456789abcdef012345678";

    const nodes: Node[] = [
      // Level 2: Merkle Root
      {
        id: "root",
        position: { x: 250, y: 15 },
        data: {
          label: (
            <div
              className={`p-2.5 rounded-lg bg-surface border-2 ${
                isAnchored ? "border-verified" : "border-warning"
              } shadow-md text-center min-w-[170px]`}
            >
              <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold mb-1">
                {isAnchored ? (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 text-verified" />
                    <span className="text-verified">ROOT (Batch #{batchId})</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-3.5 h-3.5 text-warning" />
                    <span className="text-warning">ROOT (Filling {count}/{totalExpected})</span>
                  </>
                )}
              </div>
              <code className="text-xs font-mono text-text block select-all">
                {formatHash(defaultRoot)}
              </code>
            </div>
          ),
        },
        sourcePosition: Position.Bottom,
      },
      // Level 1: Branch Nodes
      {
        id: "n01",
        position: { x: 120, y: 110 },
        data: {
          label: (
            <div className="p-2 rounded-lg bg-surface-raised border border-info/50 text-center min-w-[140px]">
              <span className="text-[10px] text-info font-medium block">Branch H(0,1)</span>
              <code className="text-[11px] font-mono text-muted block">{formatHash(n01)}</code>
            </div>
          ),
        },
        targetPosition: Position.Top,
        sourcePosition: Position.Bottom,
      },
      {
        id: "n23",
        position: { x: 390, y: 110 },
        data: {
          label: (
            <div className="p-2 rounded-lg bg-surface-raised border border-info/50 text-center min-w-[140px]">
              <span className="text-[10px] text-info font-medium block">Branch H(2,3)</span>
              <code className="text-[11px] font-mono text-muted block">{formatHash(n23)}</code>
            </div>
          ),
        },
        targetPosition: Position.Top,
        sourcePosition: Position.Bottom,
      },
      // Level 0: Leaf Nodes
      {
        id: "l0",
        position: { x: 30, y: 200 },
        data: {
          label: (
            <div className="p-1.5 rounded bg-surface-sunken border border-border text-center min-w-[110px]">
              <span className="text-[9px] text-muted block">Leaf #0</span>
              <code className="text-[10px] font-mono text-text block">{formatHash(l0)}</code>
            </div>
          ),
        },
        targetPosition: Position.Top,
      },
      {
        id: "l1",
        position: { x: 170, y: 200 },
        data: {
          label: (
            <div className="p-1.5 rounded bg-surface-sunken border border-border text-center min-w-[110px]">
              <span className="text-[9px] text-muted block">Leaf #1</span>
              <code className="text-[10px] font-mono text-text block">{formatHash(l1)}</code>
            </div>
          ),
        },
        targetPosition: Position.Top,
      },
      {
        id: "l2",
        position: { x: 320, y: 200 },
        data: {
          label: (
            <div className="p-1.5 rounded bg-surface-sunken border border-border text-center min-w-[110px]">
              <span className="text-[9px] text-muted block">Leaf #2</span>
              <code className="text-[10px] font-mono text-text block">{formatHash(l2)}</code>
            </div>
          ),
        },
        targetPosition: Position.Top,
      },
      {
        id: "l3",
        position: { x: 460, y: 200 },
        data: {
          label: (
            <div className="p-1.5 rounded bg-surface-sunken border border-border text-center min-w-[110px]">
              <span className="text-[9px] text-muted block">Leaf #3</span>
              <code className="text-[10px] font-mono text-text block">{formatHash(l3)}</code>
            </div>
          ),
        },
        targetPosition: Position.Top,
      },
    ];

    const edges: Edge[] = [
      {
        id: "e-root-n01",
        source: "root",
        target: "n01",
        animated: true,
        style: { stroke: "#2DD4BF", strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#2DD4BF" },
      },
      {
        id: "e-root-n23",
        source: "root",
        target: "n23",
        animated: true,
        style: { stroke: "#2DD4BF", strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#2DD4BF" },
      },
      {
        id: "e-n01-l0",
        source: "n01",
        target: "l0",
        animated: true,
        style: { stroke: "#60A5FA", strokeWidth: 1.5 },
      },
      {
        id: "e-n01-l1",
        source: "n01",
        target: "l1",
        animated: true,
        style: { stroke: "#60A5FA", strokeWidth: 1.5 },
      },
      {
        id: "e-n23-l2",
        source: "n23",
        target: "l2",
        animated: true,
        style: { stroke: "#60A5FA", strokeWidth: 1.5 },
      },
      {
        id: "e-n23-l3",
        source: "n23",
        target: "l3",
        animated: true,
        style: { stroke: "#60A5FA", strokeWidth: 1.5 },
      },
    ];

    return { initialNodes: nodes, initialEdges: edges };
  }, [effectiveLeaves, defaultRoot, batchId, isAnchored, count, totalExpected]);

  if (isLoading) {
    return (
      <div className={`p-5 bg-surface border border-border rounded-xl space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-surface border border-border rounded-xl ${className}`}>
        <ErrorState title="Merkle Tree Error" message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className={`p-5 bg-surface border border-border rounded-xl ${className}`}>
        <EmptyState
          icon={GitBranch}
          title="No Merkle tree available"
          description="Batch Merkle tree will be rendered when telemetry packets are sealed."
        />
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Batch Merkle Tree Visualization"
      className={`p-5 bg-surface border border-border rounded-xl shadow-sm ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-info" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text">Batch Merkle Tree Inclusion</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-info/10 text-info border border-info/30 font-mono">
            {count}/{totalExpected} packets
          </span>
        </div>

        {/* Explorer link for the anchored root */}
        <div className="flex items-center gap-2">
          {isAnchored && (
            <div className="flex items-center gap-2">
              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
                data-testid="merkle-root-explorer-link"
                className="inline-flex items-center gap-1 text-xs text-info hover:text-info/80 hover:underline font-mono bg-surface-raised px-2.5 py-1 rounded border border-border"
              >
                <span>Explorer Link</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={() => handleCopy(defaultRoot)}
                title="Copy Merkle root"
                className="p-1 rounded bg-surface-raised border border-border hover:border-info text-muted hover:text-text transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-verified" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Progress indicator when batch is filling */}
      {!isFilled && (
        <div className="mb-3 p-2.5 rounded bg-surface-raised border border-border text-xs text-muted flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-warning" />
            <span>Batch #{batchId} is acquiring telemetry ({count} of {totalExpected} packets)</span>
          </span>
          <div className="w-24 h-2 bg-surface-sunken rounded-full overflow-hidden border border-border">
            <div
              className="h-full bg-info transition-all"
              style={{ width: `${Math.round((count / totalExpected) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="h-72 w-full rounded-lg bg-surface-sunken border border-border/60 overflow-hidden">
        <ReactFlow
          nodes={initialNodes}
          edges={initialEdges}
          fitView
          attributionPosition="bottom-right"
          proOptions={{ hideAttribution: true }}
          minZoom={0.6}
          maxZoom={1.4}
        >
          <Background color="#1F2A44" gap={16} />
          <Controls className="!bg-surface !border-border !fill-text" />
        </ReactFlow>
      </div>
    </div>
  );
};
