"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Database } from "@/types/database";

export type ScheduledItem = {
  scheduledPostId: string;
  scheduledFor: string;
  status: Database["public"]["Enums"]["content_status"];
  platform: Database["public"]["Enums"]["platform"];
  title: string;
};

const STATUS_BADGE: Record<Database["public"]["Enums"]["content_status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DRAFT: { label: "Draft", variant: "outline" },
  READY_FOR_REVIEW: { label: "Ready for review", variant: "secondary" },
  APPROVED: { label: "Approved", variant: "default" },
  SCHEDULED: { label: "Scheduled", variant: "secondary" },
  PUBLISHED: { label: "Published", variant: "default" },
  FAILED: { label: "Failed", variant: "destructive" },
  READY_TO_POST: { label: "Ready to post", variant: "secondary" },
};

type ViewRange = "today" | "week" | "month";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function rangeFor(view: ViewRange, now: Date): { from: Date; to: Date } {
  const from = startOfDay(now);
  const to = new Date(from);
  if (view === "today") to.setDate(to.getDate() + 1);
  else if (view === "week") to.setDate(to.getDate() + 7);
  else to.setMonth(to.getMonth() + 1);
  return { from, to };
}

function dayKey(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function groupByDay(items: ScheduledItem[]): { key: string; sortDate: Date; items: ScheduledItem[] }[] {
  const groups = new Map<string, { sortDate: Date; items: ScheduledItem[] }>();
  for (const item of items) {
    const date = new Date(item.scheduledFor);
    const key = dayKey(date);
    const existing = groups.get(key);
    if (existing) existing.items.push(item);
    else groups.set(key, { sortDate: startOfDay(date), items: [item] });
  }
  return [...groups.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
}

const VIEW_LABEL: Record<ViewRange, string> = { today: "Today", week: "This week", month: "This month" };

export function CalendarView({ items }: { items: ScheduledItem[] }) {
  const [view, setView] = useState<ViewRange>("today");

  const filtered = useMemo(() => {
    const now = new Date();
    const { from, to } = rangeFor(view, now);
    return items.filter((item) => {
      const when = new Date(item.scheduledFor);
      return when >= from && when < to;
    });
  }, [items, view]);

  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  return (
    <Tabs value={view} onValueChange={(value) => setView(value as ViewRange)}>
      <TabsList>
        <TabsTrigger value="today">Today</TabsTrigger>
        <TabsTrigger value="week">Week</TabsTrigger>
        <TabsTrigger value="month">Month</TabsTrigger>
      </TabsList>

      <TabsContent value={view} className="mt-4 space-y-4">
        {groups.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Nothing scheduled</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Approve a draft on /content and use Schedule to put it on the {VIEW_LABEL[view].toLowerCase()} calendar.
            </CardContent>
          </Card>
        ) : (
          groups.map((group) => (
            <Card key={group.key}>
              <CardHeader>
                <CardTitle className="text-base">{group.key}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {group.items.map((item) => (
                  <div key={item.scheduledPostId} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {new Date(item.scheduledFor).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                        </span>
                        <span className="text-sm capitalize text-muted-foreground">{item.platform}</span>
                      </div>
                      <p className="text-sm">{item.title}</p>
                    </div>
                    <Badge variant={STATUS_BADGE[item.status].variant}>{STATUS_BADGE[item.status].label}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )}
      </TabsContent>
    </Tabs>
  );
}
