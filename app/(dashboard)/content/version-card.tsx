"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { VariantProps } from "class-variance-authority";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { isDecidable, isEditable, isPublishable, isSchedulable } from "@/services/approvalWorkflow";
import type { AdaptedPlatformContent, CaptionAgentOutput } from "@/types/agents";
import type { Database } from "@/types/database";
import { decideVersion, editCaption, publishNow, scheduleVersion, type CaptionEdit } from "./actions";

type ContentVersion = Database["public"]["Tables"]["content_versions"]["Row"];
type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

function toHashtagList(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean)
    .map((tag) => `#${tag}`);
}

function emptyToNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

export function VersionCard({ version, badge }: { version: ContentVersion; badge: { label: string; variant: BadgeVariant } }) {
  const [isPending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);

  const adapted = version.adapted_content as unknown as AdaptedPlatformContent | null;
  const caption = version.caption as unknown as CaptionAgentOutput | null;

  const decidable = isDecidable(version.status);
  const editable = isEditable(version.status);
  const schedulable = isSchedulable(version.status);
  const publishable = isPublishable(version.status);

  // Phase 11: publish this scheduled post now rather than waiting for the
  // cron pass to reach its scheduled time. Same server-side path either way.
  function handlePublish() {
    startTransition(async () => {
      const result = await publishNow(version.id);
      if (result.ok) toast.success("Published");
      else toast.error(result.error);
    });
  }

  function handleDecision(decision: "approve" | "reject") {
    startTransition(async () => {
      const result = await decideVersion(version.id, decision);
      if (result.ok) {
        toast.success(decision === "approve" ? "Approved" : "Rejected");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-medium capitalize">{version.platform}</span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
        {adapted && !adapted.suitable && <Badge variant="destructive">Not suitable{adapted.reason_unsuitable ? `: ${adapted.reason_unsuitable}` : ""}</Badge>}
      </div>

      {caption ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium">{caption.hook}</p>
          <p className="whitespace-pre-wrap text-muted-foreground">{caption.body}</p>
          {caption.cta && <p className="italic">{caption.cta}</p>}
          {caption.hashtags.length > 0 && <p className="text-muted-foreground">{caption.hashtags.join(" ")}</p>}
          {caption.first_comment && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">First comment: </span>
              {caption.first_comment}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Caption not generated yet.</p>
      )}

      {(caption?.warnings.length ?? 0) > 0 && (
        <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-destructive">
          {caption!.warnings.map((warning, i) => (
            <li key={i}>{warning}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={!decidable || isPending} onClick={() => handleDecision("approve")}>
          Approve
        </Button>
        <Button size="sm" variant="destructive" disabled={!decidable || isPending} onClick={() => handleDecision("reject")}>
          Reject
        </Button>
        <EditDialog version={version} caption={caption} open={editOpen} onOpenChange={setEditOpen} disabled={!editable || isPending} />
        <ScheduleDialog versionId={version.id} disabled={!schedulable || isPending} />
        {publishable && (
          <Button size="sm" disabled={isPending} onClick={handlePublish}>
            {isPending ? "Publishing…" : "Publish now"}
          </Button>
        )}
        {/* Phase 12: the manual pack — caption, first comment and every crop
            in one text file. Offered whenever there is a caption, not only
            for READY_TO_POST: posting by hand must never depend on the
            automated path having failed first. A plain link, not an action,
            because it downloads a file. */}
        {caption && (
          <Button size="sm" variant="outline" render={<a href={`/api/content/${version.id}/export`} />}>
            Export pack
          </Button>
        )}
      </div>
    </div>
  );
}

function ScheduleDialog({ versionId, disabled }: { versionId: string; disabled: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState("");

  function handleSchedule() {
    if (!when) {
      toast.error("Pick a date and time");
      return;
    }
    startTransition(async () => {
      const result = await scheduleVersion(versionId, when);
      if (result.ok) {
        toast.success("Scheduled");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" disabled={disabled} />}>Schedule</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Schedule this version</DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <Label htmlFor={`schedule-${versionId}`}>Date and time</Label>
          <Input id={`schedule-${versionId}`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>

        <DialogFooter>
          <Button onClick={handleSchedule} disabled={isPending}>
            {isPending ? "Scheduling…" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  version,
  caption,
  open,
  onOpenChange,
  disabled,
}: {
  version: ContentVersion;
  caption: CaptionAgentOutput | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [hook, setHook] = useState(caption?.hook ?? "");
  const [body, setBody] = useState(caption?.body ?? "");
  const [cta, setCta] = useState(caption?.cta ?? "");
  const [hashtags, setHashtags] = useState((caption?.hashtags ?? []).join(", "));
  const [firstComment, setFirstComment] = useState(caption?.first_comment ?? "");

  function handleSave() {
    const edit: CaptionEdit = {
      hook,
      body,
      cta: emptyToNull(cta),
      hashtags: toHashtagList(hashtags),
      first_comment: emptyToNull(firstComment),
    };

    startTransition(async () => {
      const result = await editCaption(version.id, edit);
      if (result.ok) {
        toast.success("Saved");
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="outline" disabled={disabled} />}>Edit</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="capitalize">Edit {version.platform} caption</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor={`hook-${version.id}`}>Hook</Label>
            <Textarea id={`hook-${version.id}`} value={hook} onChange={(e) => setHook(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`body-${version.id}`}>Body</Label>
            <Textarea id={`body-${version.id}`} value={body} onChange={(e) => setBody(e.target.value)} className="min-h-32" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`cta-${version.id}`}>CTA</Label>
            <Input id={`cta-${version.id}`} value={cta ?? ""} onChange={(e) => setCta(e.target.value)} placeholder="Leave blank for no CTA" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`hashtags-${version.id}`}>Hashtags (comma-separated)</Label>
            <Input id={`hashtags-${version.id}`} value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#buildinpublic, #saas" />
          </div>
          <Separator />
          <div className="space-y-1">
            <Label htmlFor={`first-comment-${version.id}`}>First comment</Label>
            <Textarea id={`first-comment-${version.id}`} value={firstComment ?? ""} onChange={(e) => setFirstComment(e.target.value)} placeholder="Leave blank for none" />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
