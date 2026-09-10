/**
 * Rules.md §1.2 guard: every item in `content.analysis.facts_to_preserve`
 * must appear unchanged in every platform version — never a rounded
 * number, softened claim, or invented one. This is the rule Implementationplan.md
 * flags as "most likely to be silently violated — it needs a test, not a
 * hope" (see tests/factsPreserved.test.ts). Pure and dependency-free so it
 * doubles as a runtime check in app/api/content/generate/route.ts.
 */

export interface FactCheckableVersion {
  hook: string;
  body: string;
  cta: string | null;
}

/** Returns the subset of `facts` that do not appear verbatim anywhere in `version`. */
export function findMissingFacts(facts: string[], version: FactCheckableVersion): string[] {
  const haystack = `${version.hook}\n${version.body}\n${version.cta ?? ""}`;
  return facts.filter((fact) => !haystack.includes(fact));
}
