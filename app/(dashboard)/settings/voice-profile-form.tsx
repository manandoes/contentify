"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { VoiceProfile } from "@/types/brandVoice";
import { saveVoiceProfile } from "./actions";

function toList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function VoiceProfileForm({ brandId, initialProfile }: { brandId: string; initialProfile: VoiceProfile }) {
  const [tone, setTone] = useState(initialProfile.tone);
  const [wordsToUse, setWordsToUse] = useState(initialProfile.words_to_use.join(", "));
  const [wordsToAvoid, setWordsToAvoid] = useState(initialProfile.words_to_avoid.join(", "));
  const [hashtagMax, setHashtagMax] = useState(String(initialProfile.hashtag_rules.max_count));
  const [hashtagAlwaysInclude, setHashtagAlwaysInclude] = useState(initialProfile.hashtag_rules.always_include.join(", "));
  const [hashtagPlacement, setHashtagPlacement] = useState(initialProfile.hashtag_rules.placement);
  const [emojiAllowed, setEmojiAllowed] = useState(initialProfile.emoji_rules.allowed);
  const [emojiMax, setEmojiMax] = useState(String(initialProfile.emoji_rules.max_count));
  const [ctaStyle, setCtaStyle] = useState(initialProfile.cta_style);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const profile: VoiceProfile = {
      tone,
      words_to_use: toList(wordsToUse),
      words_to_avoid: toList(wordsToAvoid),
      hashtag_rules: {
        max_count: Math.max(0, Number(hashtagMax) || 0),
        always_include: toList(hashtagAlwaysInclude),
        placement: hashtagPlacement,
      },
      emoji_rules: {
        allowed: emojiAllowed,
        max_count: Math.max(0, Number(emojiMax) || 0),
      },
      cta_style: ctaStyle,
    };

    startTransition(async () => {
      const result = await saveVoiceProfile(brandId, profile);
      if (result.ok) {
        toast.success("Brand voice saved");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Brand voice</CardTitle>
        <CardDescription>
          The single source every content-machine agent reads through (services/brandVoice.ts) —
          tone, words to use/avoid, hashtag rules, emoji rules, and CTA style.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="tone">Tone</Label>
          <Textarea
            id="tone"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            placeholder="Direct, a little irreverent, no corporate-speak. Talk like a founder, not a brand."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="words-to-use">Words to use (comma-separated)</Label>
            <Textarea
              id="words-to-use"
              value={wordsToUse}
              onChange={(e) => setWordsToUse(e.target.value)}
              placeholder="build in public, shipped, founder"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="words-to-avoid">Words to avoid (comma-separated)</Label>
            <Textarea
              id="words-to-avoid"
              value={wordsToAvoid}
              onChange={(e) => setWordsToAvoid(e.target.value)}
              placeholder="synergy, revolutionary, game-changing"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="hashtag-max">Max hashtags</Label>
            <Input id="hashtag-max" type="number" min={0} value={hashtagMax} onChange={(e) => setHashtagMax(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="hashtag-always">Always include (comma-separated)</Label>
            <Input
              id="hashtag-always"
              value={hashtagAlwaysInclude}
              onChange={(e) => setHashtagAlwaysInclude(e.target.value)}
              placeholder="#buildinpublic"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Hashtag placement</Label>
          <Select
            value={hashtagPlacement}
            onValueChange={(value) => setHashtagPlacement(value as VoiceProfile["hashtag_rules"]["placement"])}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="end">End of caption</SelectItem>
              <SelectItem value="first_comment">First comment</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Emoji use</Label>
            <Select value={emojiAllowed ? "yes" : "no"} onValueChange={(value) => setEmojiAllowed(value === "yes")}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no">Never</SelectItem>
                <SelectItem value="yes">Allowed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="emoji-max">Max emoji per post</Label>
            <Input
              id="emoji-max"
              type="number"
              min={0}
              value={emojiMax}
              onChange={(e) => setEmojiMax(e.target.value)}
              disabled={!emojiAllowed}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cta-style">CTA style</Label>
          <Textarea
            id="cta-style"
            value={ctaStyle}
            onChange={(e) => setCtaStyle(e.target.value)}
            placeholder="One clear ask per post. No fake urgency. It's fine to have no CTA at all."
          />
        </div>

        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving…" : "Save brand voice"}
        </Button>
      </CardContent>
    </Card>
  );
}
