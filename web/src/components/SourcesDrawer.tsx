import React from "react";
import { X, ExternalLink, ShieldCheck, HelpCircle, BookOpen } from "lucide-react";
import { loadCbamSources } from "../lib/cbam.ts";
import { Badge } from "./Badge";

export interface SourcesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SourcesDrawer: React.FC<SourcesDrawerProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const sources = loadCbamSources();
  const regulations = Object.values(sources.regulations || {});
  const variables = Object.values(sources.variables || {});

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sources-drawer-title"
      className="fixed inset-0 z-50 overflow-hidden bg-background/80 backdrop-blur-sm flex justify-end"
    >
      <div className="w-full max-w-2xl bg-surface border-l border-border h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <header className="p-5 border-b border-border flex items-center justify-between bg-surface-raised">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-info/10 border border-info/30 rounded-lg text-info">
              <BookOpen className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="sources-drawer-title" className="text-lg font-bold text-text">
                CBAM Legal Sources & Methodology
              </h2>
              <p className="text-xs text-muted">
                Primary EU regulations and variable mappings
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sources drawer"
            className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface border border-transparent hover:border-border transition-colors focus-visible:ring-2 focus-visible:ring-info focus-visible:outline-none"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Commission Legislation Link Note */}
          <div className="p-4 bg-info/10 border border-info/30 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-info flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                European Commission Primary Legislation Portal
              </span>
              <a
                href={sources.commission_cbam_legislation_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-mono text-info hover:underline"
              >
                <span>ec.europa.eu</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-xs text-muted">
              {sources.policy_note ||
                "Article numbers and parameter values are provided only where verified in primary legislation; unverified parameters remain null with status 'needs source' per provenance standards."}
            </p>
          </div>

          {/* Variables and Legal Mapping */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Variable Parameter Mapping ({variables.length} parameters)
            </h3>
            <div className="space-y-3">
              {variables.map((v) => {
                const isVerified = v.status === "VERIFIED_SECONDARY";
                return (
                  <div
                    key={v.parameter}
                    className="p-3.5 bg-surface-sunken border border-border rounded-xl space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-bold text-text block">
                          {v.parameter}
                        </span>
                        <p className="text-xs text-muted mt-0.5">{v.description}</p>
                      </div>
                      <Badge
                        variant={isVerified ? "verified" : "warning"}
                        label={isVerified ? "VERIFIED" : "NEEDS SOURCE"}
                        size="sm"
                      />
                    </div>
                    <div className="pt-2 border-t border-border/40 flex flex-wrap items-center justify-between text-[11px] font-mono text-muted">
                      <span>Regulations: {(v.regulations || []).join(", ") || "--"}</span>
                      {v.last_verified ? (
                        <span>Verified: {v.last_verified}</span>
                      ) : (
                        <span className="text-warning flex items-center gap-1">
                          <HelpCircle className="w-3 h-3" />
                          Unverified in config
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Referenced EU Regulations */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Applicable EU Regulations ({regulations.length} acts)
            </h3>
            <div className="space-y-3">
              {regulations.map((reg) => (
                <div
                  key={reg.id}
                  className="p-3.5 bg-surface-sunken border border-border rounded-xl space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-text">
                      {reg.id}
                    </span>
                    <a
                      href={reg.commission_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-info hover:underline inline-flex items-center gap-1"
                    >
                      <span>Law text</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-xs text-text font-medium">{reg.citation}</p>
                  <p className="text-xs text-muted">{reg.role}</p>
                  <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] font-mono text-muted">
                    <span>Status: {reg.status}</span>
                    <span>Last verified: {reg.last_verified}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="p-4 border-t border-border bg-surface-raised flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-surface hover:bg-border text-text border border-border transition-colors focus-visible:ring-2 focus-visible:ring-info focus-visible:outline-none"
          >
            Close Sources
          </button>
        </footer>
      </div>
    </div>
  );
};
