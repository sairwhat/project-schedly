import { headers } from "next/headers";
import { auth } from "@/server/lib/auth";

// Server-side gate for every /admin page. Non-admins get a static refusal —
// they never see the client shell, and their data can never load because the
// admin server actions also enforce requireAdmin().
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const isAdmin = Boolean(
    (session?.user as Record<string, unknown> | null)?.isAdmin
  );

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-center text-sm text-muted-foreground">
        Admin access required.
      </div>
    );
  }

  return <>{children}</>;
}
