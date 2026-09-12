/**
 * Downloads the manual export pack for one version (Phases.md Phase 12:
 * "every intended platform either publishes or produces a clean manual
 * pack"). A thin HTTP shell — the pack itself is built and rendered in
 * services/manualPack.ts.
 *
 * Plain text rather than a zip: the founder needs to copy a caption and save
 * an image or two, and a text file does that with no dependency, no archive
 * to unpack, and nothing that can silently truncate the caption.
 */
import "server-only";
import { NextResponse } from "next/server";
import { buildManualPack, renderManualPack } from "@/services/manualPack";

export async function GET(_request: Request, { params }: { params: Promise<{ versionId: string }> }): Promise<NextResponse> {
  const { versionId } = await params;

  let pack;
  try {
    pack = await buildManualPack(versionId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  if (!pack) {
    return NextResponse.json({ error: "That version doesn't exist, or has no caption to export yet." }, { status: 404 });
  }

  return new NextResponse(renderManualPack(pack), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${pack.platform}-${pack.versionId}.txt"`,
      // Signed media URLs inside expire; a cached copy would hand the
      // founder dead links.
      "Cache-Control": "no-store",
    },
  });
}
