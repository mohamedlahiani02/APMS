"use client";
import { useState, useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import TopNavigation from "@/components/layout/TopNavigation";
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [menuOpen]);
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNavigation
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((v) => !v)}
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {menuOpen && (
          <button
            aria-label="Fermer la navigation"
            className="md:hidden fixed inset-0 z-30 bg-black/40"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <main className="min-w-0 flex-1 overflow-y-auto bg-gray-50 p-3 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
