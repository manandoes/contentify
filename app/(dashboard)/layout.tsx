import Link from "next/link";

/**
 * Shared shell for every screen in Architecture.md §4's /app tree. Each
 * section below is a stub until its own phase builds the real screen —
 * see the "coming in Phase N" note on each page.tsx.
 */
const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/ideas", label: "Ideas" },
  { href: "/content", label: "Content" },
  { href: "/calendar", label: "Calendar" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" },
] as const;

// A route-group layout ((dashboard)) applies to several sibling routes at
// once (/dashboard, /ideas, /content, ...), so there's no single literal
// path to hand the generated LayoutProps<'/...'> helper — plain
// React.ReactNode is what this layout actually needs.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1">
      <aside className="w-56 shrink-0 border-r bg-muted/30 px-3 py-6">
        <Link href="/" className="mb-6 block px-3 text-lg font-semibold tracking-tight">
          Contentify
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
