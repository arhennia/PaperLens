import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient, getUser } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/dashboard/sign-out-button";

/**
 * Dashboard layout shell.
 *
 * Provides a sidebar with the folder list and a sign-out button. Every page
 * inside `(dashboard)/` inherits this shell, so the sidebar persists across
 * navigation.
 *
 * Auth check: `getUser()` validates the session server-side. If the user is not
 * signed in, they are redirected to `/login`. This is convenience, not
 * enforcement — RLS is the authoritative layer.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: folders } = await supabase
    .from("folders")
    .select("id, name, subject")
    .order("created_at", { ascending: false });

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
        {/* Logo */}
        <div className="border-b border-border px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl">📄</span>
            <span className="text-lg font-bold tracking-tight text-ink">
              PaperLens
            </span>
          </Link>
        </div>

        {/* Folder list */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <p className="mb-2 px-2 text-xs font-medium tracking-wide text-faint uppercase">
            Subject Folders
          </p>
          {folders && folders.length > 0 ? (
            <ul className="space-y-0.5">
              {folders.map((folder) => (
                <li key={folder.id}>
                  <Link
                    href={`/folders/${folder.id}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted transition-colors hover:bg-canvas hover:text-ink"
                  >
                    <span className="text-base">📁</span>
                    <span className="truncate">
                      {folder.name}
                      {folder.subject && (
                        <span className="ml-1 text-faint">
                          · {folder.subject}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 text-xs text-faint">No folders yet</p>
          )}
        </nav>

        {/* User & sign out */}
        <div className="border-t border-border px-4 py-3">
          <p className="truncate text-xs text-muted" title={user.email ?? ""}>
            {user.email}
          </p>
          <form action="/auth/signout" method="post">
            <SignOutButton />
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-canvas">{children}</main>
    </div>
  );
}

