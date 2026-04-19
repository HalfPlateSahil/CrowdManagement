import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { VenueOrchestrator } from "../application/venue-orchestrator.js";
import { demoAttendee, demoSnapshot } from "../data/demo.js";
import { compareOptimizations } from "../domain/optimizer.js";
import type { AttendeeProfile, AuditRecord, VenueSnapshot } from "../domain/models.js";
import {
  createGoogleRuntime,
  getPlatformDeliverySnapshot,
  type GooglePlatform,
  type GooglePlatformDiagnostics,
} from "../integrations/google.js";
import { optimizationComparisonSchema, optimizationRequestSchema } from "./schemas.js";

const publicDir = normalize(join(fileURLToPath(new URL("../../public/", import.meta.url))));

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

export const MAX_REQUEST_BYTES = 512 * 1024;

export interface AppContext {
  orchestrator: VenueOrchestrator;
  platform: GooglePlatform;
  diagnostics: GooglePlatformDiagnostics;
  auditTrail: AuditRecord[];
}

export function createAppContext(): AppContext {
  const runtime = createGoogleRuntime(process.env);
  const orchestrator = new VenueOrchestrator(runtime.platform);
  return { orchestrator, platform: runtime.platform, diagnostics: runtime.diagnostics, auditTrail: [] };
}

export function getDemoPayload(): { snapshot: VenueSnapshot; attendee: AttendeeProfile } {
  return { snapshot: demoSnapshot, attendee: demoAttendee };
}

export function getConfigPayload(context: AppContext): { diagnostics: GooglePlatformDiagnostics } {
  return { diagnostics: context.diagnostics };
}

export function getAuditPayload(context: AppContext): { runs: AuditRecord[] } {
  return { runs: context.auditTrail.slice(0, 20) };
}

export function getMetricsPayload(context: AppContext): {
  metrics: {
    totalRuns: number;
    optimizeRuns: number;
    compareRuns: number;
    averageConfidenceScore: number;
    mostCommonVenueStatus: "stable" | "watch" | "intervene" | "none";
  };
} {
  const totalRuns = context.auditTrail.length;
  const optimizeRuns = context.auditTrail.filter((item) => item.mode === "optimize").length;
  const compareRuns = context.auditTrail.filter((item) => item.mode === "compare").length;
  const averageConfidenceScore =
    totalRuns === 0
      ? 0
      : Number(
          (
            context.auditTrail.reduce((sum, item) => sum + item.confidenceScore, 0) / totalRuns
          ).toFixed(2),
        );
  const counts = new Map<string, number>();
  for (const run of context.auditTrail) {
    counts.set(run.venueStatus, (counts.get(run.venueStatus) ?? 0) + 1);
  }
  const mostCommonVenueStatus: "stable" | "watch" | "intervene" | "none" =
    ([...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] as
      | "stable"
      | "watch"
      | "intervene"
      | undefined) ?? "none";

  return {
    metrics: {
      totalRuns,
      optimizeRuns,
      compareRuns,
      averageConfidenceScore,
      mostCommonVenueStatus,
    },
  };
}

function normalizeAttendee(
  attendee:
    | {
        id: string;
        currentZoneId: string;
        destinationZoneId: string;
        partySize: number;
        mobilityNeed: AttendeeProfile["mobilityNeed"];
        prefersShortestWalk?: boolean | undefined;
      }
    | undefined,
): AttendeeProfile | undefined {
  if (!attendee) {
    return undefined;
  }

  const normalized: AttendeeProfile = {
    id: attendee.id,
    currentZoneId: attendee.currentZoneId,
    destinationZoneId: attendee.destinationZoneId,
    partySize: attendee.partySize,
    mobilityNeed: attendee.mobilityNeed,
  };

  if (attendee.prefersShortestWalk !== undefined) {
    normalized.prefersShortestWalk = attendee.prefersShortestWalk;
  }

  return normalized;
}

function buildEnvelope<T extends Record<string, unknown>>(
  requestId: string,
  body: T,
): T & { requestId: string; apiVersion: string; generatedAtIso: string } {
  return {
    requestId,
    apiVersion: "2026-04-15",
    generatedAtIso: new Date().toISOString(),
    ...body,
  };
}

function appendAuditRecord(context: AppContext, record: AuditRecord): void {
  context.auditTrail.unshift(record);
  if (context.auditTrail.length > 30) {
    context.auditTrail.length = 30;
  }
}

export async function runOptimizationPayload(
  context: AppContext,
  payload: { snapshot?: unknown; attendee?: unknown },
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const requestId = randomUUID();
  const parsed = optimizationRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return {
      statusCode: 400,
      body: buildEnvelope(requestId, {
        error: "Invalid optimization payload.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      }),
    };
  }

  const result = await context.orchestrator.runOptimization(
    parsed.data.snapshot,
    normalizeAttendee(parsed.data.attendee),
  );

  appendAuditRecord(context, {
    requestId,
    createdAtIso: new Date().toISOString(),
    venueId: parsed.data.snapshot.venueId,
    mode: "optimize",
    venueStatus: result.summary.venueStatus,
    confidenceScore: result.explainability.confidenceScore,
    actionCount: result.summary.recommendedActionCount,
    ...(result.summary.busiestZoneId ? { busiestZoneId: result.summary.busiestZoneId } : {}),
  });

  return {
    statusCode: 200,
    body: buildEnvelope(requestId, {
      ok: true,
      result,
      diagnostics: context.diagnostics,
      delivery: getPlatformDeliverySnapshot(context.platform),
    }),
  };
}

export function runComparisonPayload(
  context: AppContext,
  payload: { baselineSnapshot?: unknown; candidateSnapshot?: unknown; attendee?: unknown },
): { statusCode: number; body: Record<string, unknown> } {
  const requestId = randomUUID();
  const parsed = optimizationComparisonSchema.safeParse(payload);

  if (!parsed.success) {
    return {
      statusCode: 400,
      body: buildEnvelope(requestId, {
        error: "Invalid comparison payload.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      }),
    };
  }

  const comparison = compareOptimizations(
    parsed.data.baselineSnapshot,
    parsed.data.candidateSnapshot,
    normalizeAttendee(parsed.data.attendee),
  );

  appendAuditRecord(context, {
    requestId,
    createdAtIso: new Date().toISOString(),
    venueId: parsed.data.candidateSnapshot.venueId,
    mode: "compare",
    venueStatus: comparison.candidate.summary.venueStatus,
    confidenceScore: comparison.candidate.explainability.confidenceScore,
    actionCount: comparison.candidate.summary.recommendedActionCount,
    ...(comparison.candidate.summary.busiestZoneId ? { busiestZoneId: comparison.candidate.summary.busiestZoneId } : {}),
  });

  return {
    statusCode: 200,
    body: buildEnvelope(requestId, {
      ok: true,
      comparison,
      diagnostics: context.diagnostics,
    }),
  };
}

export async function resolveStaticAsset(pathname: string): Promise<{
  statusCode: number;
  body: Buffer | string;
  contentType: string;
}> {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDir, requestedPath));

  if (!filePath.startsWith(publicDir)) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Forbidden path." }),
      contentType: "application/json; charset=utf-8",
    };
  }

  try {
    const file = await readFile(filePath);
    return {
      statusCode: 200,
      body: file,
      contentType: contentTypes[extname(filePath)] ?? "application/octet-stream",
    };
  } catch {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "Not found." }),
      contentType: "application/json; charset=utf-8",
    };
  }
}
