"use client";

/**
 * Share modal — creates and manages share links for a folder.
 *
 * Creates share tokens via server action. The plaintext token is shown once and
 * can be copied. Existing active links can be revoked.
 */

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
      // Silently fail — modal will show empty state.
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
        // Error handling.
      }
    });
  }

  function handleRevoke(linkId: string) {
    startTransition(async () => {
      try {
        await revokeShareLink(linkId);
        await fetchLinks();
      } catch {
        // Error handling.
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
      {/* Trigger — rendered by the parent */}
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
          />
        </svg>
        Share
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-lg rounded-xl border border-border bg-surface p-0 shadow-xl backdrop:bg-ink/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
      >
        <div className="p-6">
          <h2 className="text-lg font-semibold text-ink">Share Workspace</h2>
          <p className="mt-1 text-sm text-muted">
            Create a public read-only link. Anyone with the link can view your
            analysis without signing in.
          </p>

          {/* New token display */}
          {newToken && (
            <div className="mt-4 rounded-lg border border-success/30 bg-success-soft p-3">
              <p className="text-xs font-medium text-success">
                ✓ Share link created
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/share/${newToken}`}
                  className="flex-1 rounded-md border border-border bg-canvas px-2 py-1.5 text-xs text-ink font-mono"
                />
                <button
                  type="button"
                  onClick={copyLink}
                  className={buttonSecondary}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="mt-2 text-xs text-faint">
                This link will not be shown again. Save it now.
              </p>
            </div>
          )}

          {/* Create button */}
          <div className="mt-4">
            <button
              type="button"
              onClick={handleCreate}
              className={buttonPrimary}
              disabled={isPending}
            >
              {isPending ? "Creating…" : "+ Create new link"}
            </button>
          </div>

          {/* Existing links */}
          {links.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-ink">Active Links</h3>
              <ul className="mt-2 space-y-2">
                {links.map((link) => (
                  <li
                    key={link.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-canvas px-3 py-2"
                  >
                    <div>
                      <p className="text-xs text-muted">
                        Created {formatDate(link.created_at)}
                      </p>
                      {link.expires_at && (
                        <p className="text-xs text-faint">
                          Expires {formatDate(link.expires_at)}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevoke(link.id)}
                      className={buttonDanger}
                      disabled={isPending}
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Close */}
          <div className="mt-6 flex justify-end">
            <button type="button" onClick={close} className={buttonSecondary}>
              Done
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
