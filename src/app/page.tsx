import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
            <Link href="/" className="flex items-center gap-2.5">
              <img src="/images/logo.jpg" alt="Schedly" className="h-8 w-8 rounded-lg object-cover" />
              <span className="text-lg font-bold tracking-tight text-foreground">Schedly</span>
            </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How it works</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm">
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] via-transparent to-transparent" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-primary/[0.06] blur-[120px]" />
          <div className="relative container mx-auto flex flex-col items-center gap-8 px-4 pt-24 pb-20 text-center md:pt-32 md:pb-28">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75 [animation-iteration-count:3]" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              AI-powered schedule management
            </div>
            <h1 className="max-w-3xl text-5xl font-bold tracking-tight text-foreground sm:text-6xl md:text-7xl leading-[1.1]">
              Your classes,{" "}
              <span className="bg-gradient-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent">
                automatically organized
              </span>
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground leading-relaxed md:text-xl">
              Snap a photo of your class schedule. Schedly extracts, organizes,
              and reminds you &mdash; so you never miss a class again.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/register">
                <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 shadow-md shadow-primary/20">
                  Start for free
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline" className="px-8">
                  Sign in
                </Button>
              </Link>
            </div>

            {/* Mock timetable preview */}
            <div className="mt-12 w-full max-w-2xl rounded-xl border border-border/60 bg-card p-6 shadow-2xl shadow-primary/5">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-3 w-3 rounded-full bg-destructive/60" />
                <div className="h-3 w-3 rounded-full bg-yellow-400/60" />
                <div className="h-3 w-3 rounded-full bg-green-400/60" />
                <span className="ml-2 text-xs text-muted-foreground font-mono">schedule.pdf</span>
              </div>
              <div className="grid grid-cols-5 gap-2 text-xs">
                <div className="rounded-lg bg-primary/10 p-3 text-center font-semibold text-primary">Mon</div>
                <div className="rounded-lg bg-primary/10 p-3 text-center font-semibold text-primary">Tue</div>
                <div className="rounded-lg bg-primary/10 p-3 text-center font-semibold text-primary">Wed</div>
                <div className="rounded-lg bg-primary/10 p-3 text-center font-semibold text-primary">Thu</div>
                <div className="rounded-lg bg-primary/10 p-3 text-center font-semibold text-primary">Fri</div>
                {[
                  { label: "Math 101", time: "9:00", color: "bg-primary/20 text-primary" },
                  { label: "", time: "", color: "" },
                  { label: "Math 101", time: "9:00", color: "bg-primary/20 text-primary" },
                  { label: "", time: "", color: "" },
                  { label: "Math 101", time: "9:00", color: "bg-primary/20 text-primary" },
                  { label: "", time: "", color: "" },
                  { label: "CS 201", time: "11:00", color: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
                  { label: "", time: "", color: "" },
                  { label: "CS 201", time: "11:00", color: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
                  { label: "Phys 301", time: "14:00", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
                  { label: "", time: "", color: "" },
                  { label: "Phys 301", time: "14:00", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
                  { label: "", time: "", color: "" },
                  { label: "Phys 301", time: "14:00", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
                  { label: "", time: "", color: "" },
                  { label: "Eng 102", time: "16:00", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
                  { label: "", time: "", color: "" },
                  { label: "Eng 102", time: "16:00", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
                ].map((item, i) => (
                  <div
                    key={i}
                    className={`rounded-lg p-2 text-center min-h-[48px] flex flex-col items-center justify-center ${item.color || "bg-muted/30"}`}
                  >
                    {item.label && <span className="font-medium leading-tight">{item.label}</span>}
                    {item.time && <span className="opacity-70">{item.time}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-border/40 bg-secondary/20">
          <div className="container mx-auto px-4 py-20 md:px-6 md:py-28">
            <div className="mx-auto max-w-2xl text-center mb-16">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Everything you need
              </h2>
              <p className="mt-3 text-muted-foreground">
                From photo to timetable in seconds.
              </p>
            </div>
            <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-3">
              <FeatureCard
                icon={
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }
                title="Snap & Extract"
                description="Upload a photo of your timetable. AI extracts every class, time, and room automatically."
              />
              <FeatureCard
                icon={
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                }
                title="Smart Reminders"
                description="Get notified before each class so you never walk in late again."
              />
              <FeatureCard
                icon={
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                }
                title="Weekly View"
                description="See your entire week at a glance with a clean, color-coded timetable."
              />
              <FeatureCard
                icon={
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                }
                title="Validated Data"
                description="AI verifies every entry against your source image. Correct before saving."
              />
              <FeatureCard
                icon={
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                }
                title="Mobile Friendly"
                description="Works great on your phone. Upload schedules on the go, check them anywhere."
              />
              <FeatureCard
                icon={
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                }
                title="Private & Secure"
                description="Your data is yours. End-to-end secure, never shared with third parties."
              />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-t border-border/40">
          <div className="container mx-auto px-4 py-20 md:px-6 md:py-28">
            <div className="mx-auto max-w-2xl text-center mb-16">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Three steps. Done.
              </h2>
              <p className="mt-3 text-muted-foreground">
                From photo to organized schedule in seconds.
              </p>
            </div>
            <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-3">
              <StepCard number={1} title="Upload" description="Take a photo or upload an image of your class schedule." />
              <StepCard number={2} title="Extract" description="AI reads your schedule and extracts all class details." />
              <StepCard number={3} title="Organize" description="Review, edit if needed, and save. Done." />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border/40 bg-gradient-to-b from-primary/[0.03] to-transparent">
          <div className="container mx-auto flex flex-col items-center gap-6 px-4 py-20 text-center md:py-28">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Ready to organize your schedule?
            </h2>
            <p className="max-w-md text-muted-foreground">
              Join Schedly and never worry about missing a class again.
            </p>
            <Link href="/register">
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 shadow-md shadow-primary/20">
                Get started for free
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/40 py-8">
        <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 md:flex-row md:px-6">
          <div className="flex items-center gap-2">
            <img src="/images/logo.jpg" alt="Schedly" className="h-6 w-6 rounded-md object-cover" />
            <span className="text-sm font-semibold text-foreground">Schedly</span>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Schedly. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group rounded-xl border border-border/60 bg-card p-6 transition-colors hover:border-primary/30 hover:bg-primary/[0.02]">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        {icon}
      </div>
      <h3 className="mb-1.5 text-base font-semibold text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground text-lg font-bold shadow-md shadow-primary/20">
        {number}
      </div>
      <h3 className="mb-1.5 text-base font-semibold text-foreground">{title}</h3>
      <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
