import type { AttendeeGuidance, Intervention, OptimizationResult } from "../domain/models.js";

export interface GoogleMapsRouteProvider {
  enrichRoute(path: string[]): Promise<{ polyline: string; mapUrl: string }>;
}

export interface FirebaseNotifier {
  notifyAttendee(attendeeId: string, title: string, body: string): Promise<void>;
  notifyStaff(zoneId: string, message: string): Promise<void>;
}

export interface GooglePubSubBus {
  publish(topic: string, payload: Record<string, unknown>): Promise<void>;
}

export interface GoogleWalletPassUpdater {
  updatePass(attendeeId: string, message: string): Promise<void>;
}

export interface BigQueryAnalyticsSink {
  writeOptimization(result: OptimizationResult): Promise<void>;
}

export interface GooglePlatform {
  maps: GoogleMapsRouteProvider;
  notifications: FirebaseNotifier;
  eventBus: GooglePubSubBus;
  wallet: GoogleWalletPassUpdater;
  analytics: BigQueryAnalyticsSink;
}

export interface GoogleConfig {
  projectId: string;
  mapsApiKey?: string;
  firebaseAudience?: string;
  walletIssuerId?: string;
  analyticsDataset?: string;
}

export function createGoogleConfig(env: Record<string, string | undefined>): GoogleConfig {
  const projectId = env.GOOGLE_CLOUD_PROJECT;

  if (!projectId) {
    throw new Error("Missing GOOGLE_CLOUD_PROJECT for Google service integration.");
  }

  const config: GoogleConfig = { projectId };

  if (env.GOOGLE_MAPS_API_KEY) {
    config.mapsApiKey = env.GOOGLE_MAPS_API_KEY;
  }

  if (env.FIREBASE_AUDIENCE) {
    config.firebaseAudience = env.FIREBASE_AUDIENCE;
  }

  if (env.GOOGLE_WALLET_ISSUER_ID) {
    config.walletIssuerId = env.GOOGLE_WALLET_ISSUER_ID;
  }

  if (env.BIGQUERY_DATASET) {
    config.analyticsDataset = env.BIGQUERY_DATASET;
  }

  return config;
}

export class InMemoryGooglePlatform implements GooglePlatform {
  public readonly sentNotifications: string[] = [];
  public readonly publishedEvents: Array<Record<string, unknown>> = [];
  public readonly walletUpdates: string[] = [];
  public readonly analyticsRows: OptimizationResult[] = [];

  public readonly maps: GoogleMapsRouteProvider = {
    enrichRoute: async (path) => ({
      polyline: path.join(">"),
      mapUrl: `https://maps.google.com/?q=${encodeURIComponent(path.join(" to "))}`,
    }),
  };

  public readonly notifications: FirebaseNotifier = {
    notifyAttendee: async (attendeeId, title, body) => {
      this.sentNotifications.push(`attendee:${attendeeId}:${title}:${body}`);
    },
    notifyStaff: async (zoneId, message) => {
      this.sentNotifications.push(`staff:${zoneId}:${message}`);
    },
  };

  public readonly eventBus: GooglePubSubBus = {
    publish: async (topic, payload) => {
      this.publishedEvents.push({ topic, payload });
    },
  };

  public readonly wallet: GoogleWalletPassUpdater = {
    updatePass: async (attendeeId, message) => {
      this.walletUpdates.push(`${attendeeId}:${message}`);
    },
  };

  public readonly analytics: BigQueryAnalyticsSink = {
    writeOptimization: async (result) => {
      this.analyticsRows.push(result);
    },
  };
}

export async function notifyGuidance(
  platform: GooglePlatform,
  guidance: AttendeeGuidance,
): Promise<void> {
  const map = await platform.maps.enrichRoute(guidance.route.path);
  await platform.notifications.notifyAttendee(
    guidance.attendeeId,
    "Venue route updated",
    `${guidance.rationale} Open map: ${map.mapUrl}`,
  );
  await platform.wallet.updatePass(
    guidance.attendeeId,
    `Follow updated route through ${guidance.route.path.join(" -> ")}.`,
  );
}

export async function broadcastInterventions(
  platform: GooglePlatform,
  interventions: Intervention[],
): Promise<void> {
  for (const intervention of interventions) {
    await platform.eventBus.publish("venue.intervention", intervention as unknown as Record<string, unknown>);

    if (intervention.targetGroup === "staff" || intervention.targetGroup === "all") {
      await platform.notifications.notifyStaff(intervention.zoneId, intervention.message);
    }
  }
}
