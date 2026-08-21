import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/app-header";
import { SideNav } from "@/components/layout/side-nav";

/**
 * Dashboard layout shell.
 *
 * Provides a unified top AppHeader (with PaperLens branding logo) and responsive
 * SideNav navigation rail. Every page inside `(dashboard)/` inherits this shell.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  let folders: { id: string; name: string; subject: string | null }[] = [];
  let displayName = "Alex Chen";

  try {
    const supabase = await createClient();
    const { data: dbFolders } = await supabase
      .from("folders")
      .select("id, name, subject")
      .order("created_at", { ascending: false });

    if (dbFolders && dbFolders.length > 0) {
      folders = dbFolders;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.display_name) {
      displayName = profile.display_name;
    }
  } catch {
    // Database offline
  }

  if (folders.length === 0) {
    const { MOCK_FOLDERS } = await import("@/lib/mock-data");
    folders = MOCK_FOLDERS.map((f) => ({
      id: f.id,
      name: f.name,
      subject: f.subject,
    }));
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900">
      {/* Top Header Bar */}
      <AppHeader
        userEmail={user.email}
        displayName={displayName}
      />

      {/* Main App Body with SideNav */}
      <div className="flex flex-1">
        <Suspense fallback={<aside className="h-[calc(100vh-4rem)] w-16 border-r border-gray-200 bg-white" />}>
          <SideNav folders={folders} />
        </Suspense>
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

