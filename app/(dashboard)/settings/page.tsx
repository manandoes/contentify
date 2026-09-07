import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Phase 4 builds the real brand-voice editor here (tone, words to
 *  use/avoid, hashtag rules, CTA style) plus connected-platform status. */
export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Brand voice + connected platforms — Phase 4</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Tone, words to use/avoid, hashtag rules, emoji rules, and CTA style will be
          editable here — the single retrieval point every downstream agent reads from
          (services/brandVoice.ts).
        </CardContent>
      </Card>
    </div>
  );
}
