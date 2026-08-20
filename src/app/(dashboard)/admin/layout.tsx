import { headers } from "next/headers";

async function getAuth() {
  const { auth } = await import("@/server/lib/auth");
  return auth;
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let isAdmin = false;
  let authError: string | null = null;

  try {
    const auth = await getAuth();
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    isAdmin = Boolean(
      (session?.user as Record<string, unknown> | null)?.isAdmin
    );
  } catch (err) {
    authError = err instanceof Error ? err.message : String(err);
    console.error("[AdminLayout] Auth error:", authError);
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-center text-sm text-muted-foreground">
        {authError ? (
          <>
            Auth error: {authError}{" "}
            <br />
            Please log in to access the admin dashboard.
          </>
        ) : (
          "Admin access required."
        )}
      </div>
    );
  }

  return <>{children}</>;
}
