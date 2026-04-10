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

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAttendeeProfile(value: unknown): value is AttendeeProfile {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.currentZoneId === "string" &&
    typeof value.destinationZoneId === "string" &&
    typeof value.partySize === "number" &&
    typeof value.mobilityNeed === "string"
  );
}

export function isVenueSnapshot(value: unknown): value is VenueSnapshot {
  return (
    isObject(value) &&
    typeof value.venueId === "string" &&
    typeof value.timestampIso === "string" &&
    Array.isArray(value.zones) &&
    Array.isArray(value.connections) &&
    Array.isArray(value.servicePoints)
  );
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
  const snapshot = payload.snapshot;
  const attendee = payload.attendee;

  if (!isVenueSnapshot(snapshot)) {
    return { statusCode: 400, body: { error: "Invalid or missing snapshot payload." } };
  }

  if (attendee !== undefined && !isAttendeeProfile(attendee)) {
    return { statusCode: 400, body: { error: "Invalid attendee payload." } };
  }

  const result = await context.orchestrator.runOptimization(snapshot, attendee);
  return {
    statusCode: 200,
    body: {
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
