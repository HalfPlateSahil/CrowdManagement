import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { VenueOrchestrator } from "../application/venue-orchestrator.js";
import { demoAttendee, demoSnapshot } from "../data/demo.js";
import type { AttendeeProfile, VenueSnapshot } from "../domain/models.js";
import {
  createGoogleRuntime,
  getPlatformDeliverySnapshot,
  type GooglePlatform,
  type GooglePlatformDiagnostics,
} from "../integrations/google.js";
import { optimizationRequestSchema } from "./schemas.js";

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
}

export function createAppContext(): AppContext {
  const runtime = createGoogleRuntime(process.env);
  const orchestrator = new VenueOrchestrator(runtime.platform);
  return { orchestrator, platform: runtime.platform, diagnostics: runtime.diagnostics };
}

export function getDemoPayload(): { snapshot: VenueSnapshot; attendee: AttendeeProfile } {
  return { snapshot: demoSnapshot, attendee: demoAttendee };
}

export function getConfigPayload(context: AppContext): { diagnostics: GooglePlatformDiagnostics } {
  return { diagnostics: context.diagnostics };
}

export async function runOptimizationPayload(
  context: AppContext,
  payload: { snapshot?: unknown; attendee?: unknown },
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const parsed = optimizationRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      statusCode: 400,
      body: {
        error: "Invalid optimization payload.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
  }

  const attendee = parsed.data.attendee
    ? {
        id: parsed.data.attendee.id,
        currentZoneId: parsed.data.attendee.currentZoneId,
        destinationZoneId: parsed.data.attendee.destinationZoneId,
        partySize: parsed.data.attendee.partySize,
        mobilityNeed: parsed.data.attendee.mobilityNeed,
        ...(parsed.data.attendee.prefersShortestWalk !== undefined
          ? { prefersShortestWalk: parsed.data.attendee.prefersShortestWalk }
          : {}),
      }
    : undefined;

  const result = await context.orchestrator.runOptimization(parsed.data.snapshot, attendee);
  return {
    statusCode: 200,
    body: {
      ok: true,
      result,
      diagnostics: context.diagnostics,
      delivery: getPlatformDeliverySnapshot(context.platform),
    },
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
