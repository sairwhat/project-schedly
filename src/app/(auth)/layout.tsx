import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-primary/70">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/20 to-transparent" />
        <div className="relative z-10 flex flex-col justify-between p-12 text-primary-foreground">
          <Link href="/" className="flex items-center gap-3">
            <img src="/images/logo.jpg" alt="Schedly" className="h-10 w-10 rounded-xl object-cover" />
            <span className="text-2xl font-bold tracking-tight">Schedly</span>
          </Link>
          <div className="space-y-6">
            <h1 className="text-4xl font-bold leading-tight tracking-tight">
              Your classes,
              <br />
              automatically
              <br />
              organized.
            </h1>
            <p className="max-w-md text-lg text-primary-foreground/80 leading-relaxed">
              Snap a photo of your class schedule. Schedly extracts,
              organizes, and reminds you &mdash; so you never miss a class again.
            </p>
            <div className="flex gap-8 pt-2">
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-bold">AI</span>
                <span className="text-sm text-primary-foreground/70">Smart extraction</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-bold">24/7</span>
                <span className="text-sm text-primary-foreground/70">Reminders</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-bold">100%</span>
                <span className="text-sm text-primary-foreground/70">Free</span>
              </div>
            </div>
          </div>
          <p className="text-sm text-primary-foreground/50">
            &copy; {new Date().getFullYear()} Schedly
          </p>
        </div>
      </div>
      <div className="flex w-full items-center justify-center bg-background p-4 lg:w-1/2 lg:p-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Link href="/" className="inline-flex items-center gap-2">
              <img src="/images/logo.jpg" alt="Schedly" className="h-8 w-8 rounded-lg object-cover" />
              <span className="text-xl font-bold tracking-tight text-foreground">Schedly</span>
            </Link>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
