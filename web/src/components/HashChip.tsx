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
    return <Skeleton className={`h-6 w-24 rounded-chip inline-block ${className}`} />;
  }

  if (error) {
    return (
      <span
        role="status"
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-chip text-xs font-mono bg-[#FDECEC] border border-[#FCA5A5] text-[#9B1C1C] dark:bg-red-500/20 dark:text-[#FF6B6B] ${className}`}
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
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-chip text-xs font-mono bg-surface-soft border border-hairline text-muted-strong italic ${className}`}
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
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-chip text-[12px] font-mono font-medium bg-surface-soft border border-hairline text-ink hover:border-brand/40 transition-colors group ${className}`}
      title={clean}
    >
      <span className="select-all">{displayHash}</span>

      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Hash copied to clipboard" : "Copy full hash to clipboard"}
        className="p-0.5 rounded-pill hover:bg-hairline text-muted-strong hover:text-ink transition-colors focus-visible:ring-1 focus-visible:ring-brand focus-visible:outline-none"
      >
        {copied ? (
          <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        ) : (
          <Copy className="w-3 h-3 opacity-60 group-hover:opacity-100" aria-hidden="true" />
        )}
      </button>

      {defaultExplorer && (
        <a
          href={defaultExplorer}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${type} on block explorer`}
          className="p-0.5 rounded-pill hover:bg-hairline text-muted-strong hover:text-ink transition-colors focus-visible:ring-1 focus-visible:ring-brand focus-visible:outline-none"
        >
          <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100" aria-hidden="true" />
        </a>
      )}
    </span>
  );
};

export default HashChip;
