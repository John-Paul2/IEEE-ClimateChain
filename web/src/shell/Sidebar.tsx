import React from "react";
import { NavLink } from "react-router-dom";
import {
  Activity,
  ShieldCheck,
  Calculator,
  BarChart3,
  Component,
  Lock,
  Layers,
} from "lucide-react";

export interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const navItems = [
    {
      to: "/operator",
      label: "Operator",
      icon: Activity,
      description: "Edge Gateway & Telemetry",
    },
    {
      to: "/verifier",
      label: "Verifier",
      icon: ShieldCheck,
      description: "Quorum & Challenge Window",
    },
    {
      to: "/importer",
      label: "Importer",
      icon: Calculator,
      description: "CBAM Calculator & Attestation",
    },
    {
      to: "/benchmark",
      label: "Benchmark",
      icon: BarChart3,
      description: "8 Adversarial Attacks & ROC",
    },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        id="main-sidebar"
        aria-label="Main Navigation"
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-surface border-r border-border flex flex-col justify-between transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div>
          {/* Brand header */}
          <div className="h-16 px-5 flex items-center gap-3 border-b border-border">
            <div className="p-2 rounded-lg bg-verified/10 border border-verified/30 text-verified">
              <Lock className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-text">VeriCEMS</span>
              <span className="block text-[10px] uppercase font-mono text-muted tracking-wider">
                CBAM-Aligned Telemetry
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1" aria-label="Sections">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? "bg-surface-raised border border-info/40 text-text font-semibold shadow-sm"
                        : "text-muted hover:text-text hover:bg-surface-raised/50"
                    }`
                  }
                >
                  <Icon className="w-4 h-4 flex-shrink-0 text-info" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <span className="block truncate">{item.label}</span>
                    <span className="block text-[10px] text-muted truncate font-normal">
                      {item.description}
                    </span>
                  </div>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Footer / Utilities */}
        <div className="p-3 border-t border-border space-y-2">
          <NavLink
            to="/gallery"
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? "bg-surface-raised border border-border text-text"
                  : "text-muted hover:text-text hover:bg-surface-raised/50"
              }`
            }
          >
            <Component className="w-4 h-4 text-muted" aria-hidden="true" />
            <span>Design System Gallery</span>
          </NavLink>

          <div className="p-2.5 rounded-lg bg-surface-sunken border border-border/60 text-[11px] text-muted flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-mono">
              <Layers className="w-3.5 h-3.5 text-info" />
              <span>Track 4 Prototype</span>
            </span>
            <span className="font-mono text-text">v1.0.0</span>
          </div>
        </div>
      </aside>
    </>
  );
};
