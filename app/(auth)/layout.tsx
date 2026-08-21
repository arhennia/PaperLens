/**
 * Auth layout shell.
 * Soft pastel lavender background matching the cute auth design.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#EBF0F8] p-4 sm:p-6 md:p-10">
      <div className="w-full max-w-4xl flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
