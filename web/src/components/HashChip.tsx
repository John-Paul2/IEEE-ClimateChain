import React, { useState, useCallback } from "react";
import { Copy, Check, ExternalLink, AlertCircle } from "lucide-react";
import { Skeleton } from "./Skeleton";

export interface HashChipProps {
  hash?: string | null;
  type?: "tx" | "address" | "root" | "digest";
  truncateLen?: number;
  explorerUrl?: string;
  className?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: string | null;
}

export const HashChip: React.FC<HashChipProps> = ({
  hash,
  type = "digest",
  truncateLen = 4,
  explorerUrl,
  className = "",
  isLoading = false,
  isEmpty = false,
  error = null,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!hash) return;
      try {
        await navigator.clipboard.writeText(hash);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        console.error("Failed to copy hash to clipboard");
      }
    },
    [hash]
  );

  if (isLoading) {
    return <Skeleton className={`h-7 w-28 rounded-md inline-block ${className}`} />;
  }

  if (error) {
    return (
      <span
        role="status"
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-flagged/10 border border-flagged/30 text-flagged ${className}`}
      >
        <AlertCircle className="w-3 h-3" aria-hidden="true" />
        <span>Invalid hash</span>
      </span>
    );
  }

  if (isEmpty || !hash) {
    return (
      <span
        role="status"
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-surface-raised border border-border text-muted italic ${className}`}
      >
        <span>null</span>
      </span>
    );
  }

  const clean = hash.startsWith("0x") ? hash : `0x${hash}`;
  const displayHash =
    clean.length > truncateLen * 2 + 4
      ? `${clean.slice(0, truncateLen + 2)}...${clean.slice(-truncateLen)}`
      : clean;

  const defaultExplorer =
    explorerUrl ||
    (type === "tx"
      ? `https://sepolia.arbiscan.io/tx/${clean}`
      : type === "address"
      ? `https://sepolia.arbiscan.io/address/${clean}`
      : undefined);

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-surface-sunken border border-border text-text hover:border-info/50 transition-colors group ${className}`}
      title={clean}
    >
      <span className="select-all">{displayHash}</span>

      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Hash copied to clipboard" : "Copy full hash to clipboard"}
        className="p-0.5 rounded hover:bg-surface-raised text-muted hover:text-text transition-colors focus-visible:ring-1 focus-visible:ring-info focus-visible:outline-none"
      >
        {copied ? (
          <Check className="w-3 h-3 text-verified" aria-hidden="true" />
        ) : (
          <Copy className="w-3 h-3 opacity-60 group-hover:opacity-100" aria-hidden="true" />
        )}
      </button>

      {defaultExplorer && (
        <a
          href={defaultExplorer}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View on block explorer"
          className="p-0.5 rounded hover:bg-surface-raised text-muted hover:text-info transition-colors focus-visible:ring-1 focus-visible:ring-info focus-visible:outline-none"
        >
          <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100" aria-hidden="true" />
        </a>
      )}
    </span>
  );
};
