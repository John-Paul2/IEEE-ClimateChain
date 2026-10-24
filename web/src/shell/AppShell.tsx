import React from "react";
import { Outlet } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { TopBar } from "./TopBar.tsx";
import { EventTicker } from "./EventTicker.tsx";
import { useData } from "../data/DataContext.tsx";
import { StorySpotlight } from "../story/StorySpotlight.tsx";
import { StoryEnd } from "../components/GuideLayer.tsx";

export const AppShell: React.FC = () => {
  const { liveConnectionFailed, clearLiveFailure } = useData();

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col transition-colors selection:bg-brand selection:text-white max-w-full [overflow-x:clip]">
      {/* Guided Story Spotlight & Captions */}
      <StorySpotlight />

      {/* Sticky Top Navigation Bar & Event Ticker */}
      <div className="sticky top-0 z-40 w-full shadow-sm">
        <TopBar />
        <EventTicker />
        {liveConnectionFailed && (
          <div
            role="alert"
            data-testid="live-failure-banner"
            className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 text-xs sm:text-sm font-medium text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 max-w-full">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
              <span>Live connection failed. Showing the recorded run.</span>
            </div>
            <button
              type="button"
              onClick={clearLiveFailure}
              className="p-1 rounded hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 transition-colors"
              aria-label="Dismiss banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Centred 1200px Main Content Column */}
      <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-48 sm:pb-12 [contain:paint]">
        <StoryEnd />
        <Outlet />
      </main>
    </div>
  );
};

export default AppShell;
