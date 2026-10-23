import React from "react";
import { Outlet } from "react-router-dom";
import { TopBar } from "./TopBar";
import { EventTicker } from "./EventTicker";

export const AppShell: React.FC = () => {
  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col transition-colors selection:bg-brand selection:text-white max-w-full [overflow-x:clip]">
      {/* Sticky Top Navigation Bar & Event Ticker */}
      <div className="sticky top-0 z-40 w-full shadow-sm">
        <TopBar />
        <EventTicker />
      </div>

      {/* Centred 1200px Main Content Column */}
      <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 sm:px-6 py-6 sm:py-8 [contain:paint]">
        <Outlet />
      </main>
    </div>
  );
};

export default AppShell;
