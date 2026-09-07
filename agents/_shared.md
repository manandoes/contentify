<!--
  Shared rules every content-machine agent inherits, verbatim from
  Rules.md §4 ¶1. lib/gemini.ts's runAgent() prepends this file to every
  agent prompt automatically — it is never copy-pasted into the individual
  agent files below, so there is exactly one place to edit it.

  Applies to: contentAnalyzer, platformAdapter, captionAgent, performanceAgent.
  Does NOT apply to the idea-engine agents (researcher, hookWriter,
  ideaFinalizer) — they have their own complete, self-contained rule sets.
-->

Preserve every item in facts_to_preserve unchanged. Apply the brand voice and
never use words_to_avoid. No invented stats, claims, or quotes. One clear
CTA. No fake urgency or hype. If the content doesn't suit a platform, say so
instead of forcing it. On error, return partial output with a warnings[]
array rather than fabricating.
