import { redirect } from "next/navigation";

import { getUser } from "@/lib/supabase/server";

/**
 * Auth layout shell.
 *
 * Centred, brandless container for login and signup pages. If the user is
 * already signed in, they are redirected to the dashboard — there is no reason
 * to show a login form to a logged-in user.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (user && process.env.NODE_ENV !== "development") redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
