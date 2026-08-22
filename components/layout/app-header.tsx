"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { AccountSettingsModal } from "@/components/dashboard/account-settings-modal";

interface AppHeaderProps {
  userEmail?: string | null;
  displayName?: string | null;
  createdAt?: string | null;
  onShareClick?: () => void;
}

export function AppHeader({
  userEmail,
  displayName,
  createdAt,
  onShareClick,
}: AppHeaderProps) {
  const [shareCopied, setShareCopied] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    }

    if (isAccountMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isAccountMenuOpen]);

  function handleShare() {
    if (onShareClick) {
      onShareClick();
      return;
    }
    const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/share/demo-preview`;
    navigator.clipboard?.writeText(shareUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2500);
  }

  function handleOpenSettings() {
    setIsAccountMenuOpen(false);
    setIsSettingsModalOpen(true);
  }

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-border bg-white px-6">
        {/* Left: PaperLens Logo */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center">
            <div className="relative h-8 w-44">
              <Image
                src="/logo.png"
                alt="PaperLens Logo"
                fill
                priority
                sizes="176px"
                className="object-contain object-left"
              />
            </div>
          </Link>
        </div>

        {/* Right: Actions & User Avatar */}
        <div className="flex items-center gap-4">
          {/* Share Workspace Button */}
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-accent/90"
          >
            <span className="material-symbols-outlined text-[16px]">share</span>
            <span>{shareCopied ? "Link Copied!" : "Share Workspace"}</span>
          </button>

          {/* User Account Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
              title={displayName || userEmail || "Account"}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-ink text-xs font-bold text-white shadow-xs transition-transform hover:scale-105"
            >
              {displayName ? displayName.slice(0, 2).toUpperCase() : "AC"}
            </button>

            {/* Account Dropdown Menu */}
            {isAccountMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-lg border border-border bg-white shadow-lg">
                <div className="border-b border-border px-4 py-3">
                  <p className="text-xs font-medium text-muted">Account</p>
                  <p className="mt-1 truncate text-sm text-ink">{userEmail}</p>
                </div>
                <button
                  onClick={handleOpenSettings}
                  className="w-full px-4 py-2 text-left text-sm text-ink transition-colors hover:bg-gray-50"
                >
                  Account Settings
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Account Settings Modal */}
      <AccountSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        userEmail={userEmail}
        createdAt={createdAt}
      />
    </>
  );
}
