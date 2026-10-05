import Link from "next/link";
import { signOut } from "@/app/login/actions";

export function Shell({ children, userName }: { children: React.ReactNode; userName: string }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/trips" className="text-sm font-bold tracking-tight">
            Make<span className="text-accent">It</span>Happen
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/trips" className="text-muted hover:text-fg">
              My trips
            </Link>
            <Link href="/trips/new" className="btn-primary px-3 py-1.5">
              New trip
            </Link>
            <Link href="/settings" className="text-muted hover:text-fg" title="Settings">
              {userName}
            </Link>
            <form action={signOut}>
              <button className="text-muted hover:text-fg" type="submit">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
