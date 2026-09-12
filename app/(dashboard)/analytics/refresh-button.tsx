"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refreshAnalyticsNow } from "./actions";

export function RefreshButton() {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await refreshAnalyticsNow();
      if (result.ok) {
        toast.success(
          result.attempted === 0
            ? "Nothing to refresh — no published posts with a platform post id yet"
            : `Refreshed ${result.fetched} of ${result.attempted} published post${result.attempted === 1 ? "" : "s"}`,
        );
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
      {isPending ? "Refreshing…" : "Refresh now"}
    </Button>
  );
}
