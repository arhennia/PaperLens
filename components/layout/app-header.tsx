"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

interface AppHeaderProps {
  userEmail?: string | null;
  displayName?: string | null;
  onShareClick?: () => void;
}

export function AppHeader({ userEmail, displayName, onShareClick }: AppHeaderProps) {
  const [shareCopied, setShareCopied] = useState(false);

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

  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-gray-200 bg-white px-6">
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
        {/* Share Workspace Button (Ref blue) */}
        <button
          type="button"
          onClick={handleShare}
          className="flex items-center gap-1.5 rounded-md bg-[#0099FF] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#0088ee]"
        >
          <span className="material-symbols-outlined text-[16px]">share</span>
          <span>{shareCopied ? "Link Copied!" : "Share Workspace"}</span>
        </button>

        {/* User Profile Avatar Circle */}
        <Link
          href="/profile"
          title={displayName || userEmail || "User Account"}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-gray-900 text-xs font-bold text-white shadow-xs transition-transform hover:scale-105"
        >
          {displayName ? displayName.slice(0, 2).toUpperCase() : "AC"}
        </Link>
      </div>
    </header>
  );
}
