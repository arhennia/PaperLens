"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAccount, logOut } from "@/app/actions/auth";
import { buttonPrimary, buttonSecondary, buttonDanger } from "@/components/ui/button";

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string | null;
  createdAt?: string | null;
}

export function AccountSettingsModal({
  isOpen,
  onClose,
  userEmail,
  createdAt,
}: AccountSettingsModalProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!isOpen) return null;

  async function handleLogOut() {
    setIsLoggingOut(true);
    try {
      await logOut();
      router.push("/login");
    } catch (error) {
      console.error("Log out failed:", error);
      setIsLoggingOut(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmation !== "DELETE") {
      return;
    }
    setIsDeletingAccount(true);
    try {
      await deleteAccount();
      router.push("/login");
    } catch (error) {
      console.error("Delete account failed:", error);
      setIsDeletingAccount(false);
    }
  }

  const formattedDate = createdAt
    ? new Date(createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-ink">Account Settings</h2>

        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {/* Account Info */}
          <div>
            <p className="text-xs font-medium text-muted">Email</p>
            <p className="mt-1 text-sm text-ink">{userEmail || "—"}</p>
          </div>

          {formattedDate && (
            <div>
              <p className="text-xs font-medium text-muted">Account Created</p>
              <p className="mt-1 text-sm text-ink">{formattedDate}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 space-y-3 border-t border-border pt-6">
          <button
            onClick={handleLogOut}
            disabled={isLoggingOut || isDeletingAccount}
            className={`w-full ${buttonSecondary}`}
          >
            {isLoggingOut ? "Logging out…" : "Log Out"}
          </button>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeletingAccount}
              className={`w-full ${buttonDanger}`}
            >
              Delete Account & Data
            </button>
          ) : (
            <div className="space-y-3 rounded-lg border border-danger/30 bg-danger/5 p-4">
              <p className="text-xs text-muted">
                This action cannot be undone. All your data will be permanently deleted.
              </p>
              <input
                type="text"
                placeholder='Type "DELETE" to confirm'
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-ink placeholder-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmation("");
                  }}
                  disabled={isDeletingAccount}
                  className={`flex-1 ${buttonSecondary}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmation !== "DELETE" || isDeletingAccount}
                  className={`flex-1 ${buttonDanger}`}
                >
                  {isDeletingAccount ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted transition-colors hover:text-ink"
          aria-label="Close"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>
    </div>
  );
}
