"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  createShareLink,
  revokeShareLink,
  getShareLinks,
} from "@/app/actions/share";
import { buttonPrimary, buttonSecondary, buttonDanger } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

interface ShareLink {
  id: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

export function ShareModal({ folderId }: { folderId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fetchLinks = useCallback(async () => {
    try {
      const data = await getShareLinks(folderId);
      setLinks(data);
    } catch {
      // Silently fail
    }
  }, [folderId]);

  function open() {
    setNewToken(null);
    setCopied(false);
    fetchLinks();
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function handleCreate() {
    startTransition(async () => {
      try {
        const { token } = await createShareLink(folderId);
        setNewToken(token);
        setCopied(false);
        await fetchLinks();
      } catch {
        // Error handling
      }
    });
  }

  function handleRevoke(linkId: string) {
    startTransition(async () => {
      try {
        await revokeShareLink(linkId);
        await fetchLinks();
      } catch {
        // Error handling
      }
    });
  }

  function copyLink() {
    if (!newToken) return;
    const url = `${window.location.origin}/share/${newToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs md:text-sm font-semibold text-ink shadow-xs hover:bg-surface-container transition-all cursor-pointer"
      >
        <span className="material-symbols-outlined text-[18px] text-muted">
          ios_share
        </span>
        <span>Share Workspace</span>
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-lg rounded-2xl border border-border bg-surface p-0 shadow-2xl backdrop:bg-ink/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
      >
        <div className="p-6">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-2xl">
                share
              </span>
              <h2 className="text-base font-bold text-ink">
                Share Analyzed Workspace
              </h2>
            </div>
            <button
              type="button"
              onClick={close}
              className="text-faint hover:text-ink transition-colors p-1"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <p className="mt-3 text-xs text-muted leading-relaxed">
            Generate a secure, public read-only link for study peers. Anyone with this link can view the extracted questions, topic weightage, and study tools without needing to log in.
          </p>

          {/* Newly created token display */}
          {newToken && (
            <div className="mt-4 rounded-xl border border-success/30 bg-success-soft p-4">
              <p className="text-xs font-bold text-success flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>Share Link Ready</span>
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/share/${newToken}`}
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-ink font-mono select-all shadow-2xs"
                />
                <button
                  type="button"
                  onClick={copyLink}
                  className={`${buttonPrimary} text-xs font-semibold px-4`}
                >
                  {copied ? "Copied! ✓" : "Copy Link"}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-faint">
                Save or send this link now.
              </p>
            </div>
          )}

          {/* Action button */}
          <div className="mt-4">
            <button
              type="button"
              onClick={handleCreate}
              className={`${buttonPrimary} text-xs font-semibold`}
              disabled={isPending}
            >
              {isPending ? "Generating Share Link…" : "+ Generate New Share Link"}
            </button>
          </div>

          {/* Existing active links */}
          {links.length > 0 && (
            <div className="mt-6 border-t border-border pt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
                Active Public Links ({links.length})
              </h3>
              <ul className="mt-3 space-y-2">
                {links.map((link) => (
                  <li
                    key={link.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-surface-container-low p-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-ink">
                        Created {formatDate(link.created_at)}
                      </p>
                      {link.expires_at && (
                        <p className="text-[11px] text-faint">
                          Expires {formatDate(link.expires_at)}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevoke(link.id)}
                      className={`${buttonDanger} text-xs py-1 px-2.5`}
                      disabled={isPending}
                    >
                      Revoke Link
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex justify-end border-t border-border pt-3">
            <button type="button" onClick={close} className={buttonSecondary}>
              Done
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
