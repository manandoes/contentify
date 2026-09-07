import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Phase 0 placeholder. Replaced by the real dashboard home screen once
 * app/(dashboard)/dashboard is built (Phases.md, throughout Blocks B-D).
 * Exists now so Phase 0's "Done when: the app loads in a browser and
 * connects to the database" has something concrete to check.
 */
export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Contentify</h1>
      <p className="max-w-md text-muted-foreground">
        Idea Engine + Content Machine. You approve, you don&apos;t write.
      </p>
      {/* This shadcn setup is on Base UI, not Radix — composition goes
          through `render`, not an `asChild` + nested-child pattern. */}
      <Button render={<Link href="/dashboard" />}>Open dashboard</Button>
    </div>
  );
}
