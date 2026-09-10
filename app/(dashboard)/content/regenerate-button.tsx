"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { regenerateContent } from "./actions";

export function RegenerateButton({ contentId }: { contentId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await regenerateContent(contentId);
      if (result.ok) {
        toast.success("Regenerated — every platform draft is back up for review");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
      {isPending ? "Regenerating…" : "Regenerate"}
    </Button>
  );
}
