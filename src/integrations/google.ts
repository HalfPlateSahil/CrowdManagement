import { GoogleAuth } from "google-auth-library";
import { getApps, initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { BigQuery } from "@google-cloud/bigquery";
import { PubSub } from "@google-cloud/pubsub";

import type { AttendeeGuidance, Intervention, OptimizationResult } from "../domain/models.js";

const GOOGLE_AUTH_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/wallet_object.issuer",
];

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

export interface GooglePlatformDiagnostics {
  mode: "demo" | "live";
  projectId?: string;
  integrations: {
    maps: "configured" | "demo";
    notifications: "configured" | "demo";
    pubsub: "configured" | "demo";
    wallet: "configured" | "demo";
    analytics: "configured" | "demo";
  };
}

export interface GoogleConfig {
  mode: "demo" | "live";
  projectId: string;
  mapsApiKey?: string;
  firebaseAudience?: string;
  firebaseServiceAccountJson?: string;
  walletIssuerId?: string;
  walletClassId?: string;
  analyticsDataset?: string;
  analyticsTable?: string;
  pubsubTopic?: string;
}

export interface GoogleRuntime {
  platform: GooglePlatform;
  diagnostics: GooglePlatformDiagnostics;
}

function parseMode(value: string | undefined): "demo" | "live" {
  return value === "live" ? "live" : "demo";
}

export function createGoogleConfig(env: Record<string, string | undefined>): GoogleConfig {
  const mode = parseMode(env.GOOGLE_SERVICES_MODE);
  const projectId = env.GOOGLE_CLOUD_PROJECT ?? "demo-project";

  const config: GoogleConfig = {
    mode,
    projectId,
  };

  if (env.GOOGLE_MAPS_API_KEY) {
    config.mapsApiKey = env.GOOGLE_MAPS_API_KEY;
  }

  if (env.FIREBASE_AUDIENCE) {
    config.firebaseAudience = env.FIREBASE_AUDIENCE;
  }

  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    config.firebaseServiceAccountJson = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  }

  if (env.GOOGLE_WALLET_ISSUER_ID) {
    config.walletIssuerId = env.GOOGLE_WALLET_ISSUER_ID;
  }

  if (env.GOOGLE_WALLET_CLASS_ID) {
    config.walletClassId = env.GOOGLE_WALLET_CLASS_ID;
  }

  if (env.BIGQUERY_DATASET) {
    config.analyticsDataset = env.BIGQUERY_DATASET;
  }

  if (env.BIGQUERY_TABLE) {
    config.analyticsTable = env.BIGQUERY_TABLE;
  }

  if (env.PUBSUB_TOPIC) {
    config.pubsubTopic = env.PUBSUB_TOPIC;
  }

  return config;
}

function createDemoMapUrl(path: string[]): string {
  return `https://maps.google.com/?q=${encodeURIComponent(path.join(" to "))}`;
}

function getRequiredConfigValue(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing ${label} for live Google integration mode.`);
  }

  return value;
}

function getGoogleAuth(projectId: string): GoogleAuth {
  return new GoogleAuth({
    projectId,
    scopes: GOOGLE_AUTH_SCOPES,
  });
}

async function getAccessToken(auth: GoogleAuth): Promise<string> {
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === "string" ? tokenResponse : tokenResponse.token;

  if (!token) {
    throw new Error("Could not obtain Google access token.");
  }

  return token;
}

function initializeFirebase(config: GoogleConfig): void {
  if (getApps().length > 0) {
    return;
  }

  if (config.firebaseServiceAccountJson) {
    const credentials = JSON.parse(config.firebaseServiceAccountJson) as Record<string, unknown>;
    const projectId = getRequiredConfigValue(
      typeof credentials.project_id === "string" ? credentials.project_id : undefined,
      "FIREBASE_SERVICE_ACCOUNT_JSON.project_id",
    );
    const clientEmail = getRequiredConfigValue(
      typeof credentials.client_email === "string" ? credentials.client_email : undefined,
      "FIREBASE_SERVICE_ACCOUNT_JSON.client_email",
    );
    const privateKey = getRequiredConfigValue(
      typeof credentials.private_key === "string" ? credentials.private_key : undefined,
      "FIREBASE_SERVICE_ACCOUNT_JSON.private_key",
    );

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    return;
  }

  initializeApp({
    credential: applicationDefault(),
    projectId: config.projectId,
  });
}

export class InMemoryGooglePlatform implements GooglePlatform {
  public readonly sentNotifications: string[] = [];
  public readonly publishedEvents: Array<Record<string, unknown>> = [];
  public readonly walletUpdates: string[] = [];
  public readonly analyticsRows: OptimizationResult[] = [];

  public readonly maps: GoogleMapsRouteProvider = {
    enrichRoute: async (path) => ({
      polyline: path.join(">"),
      mapUrl: createDemoMapUrl(path),
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

class GoogleMapsPlatformRoutesProvider implements GoogleMapsRouteProvider {
  public constructor(private readonly apiKey: string) {}

  public async enrichRoute(path: string[]): Promise<{ polyline: string; mapUrl: string }> {
    const waypoints = path.map((label) => ({ address: label }));
    const [origin, ...rest] = waypoints;
    const destination = rest.length > 0 ? rest[rest.length - 1] : origin;
    const intermediates = rest.slice(0, -1);

    if (!origin || !destination) {
      return { polyline: path.join(">"), mapUrl: createDemoMapUrl(path) };
    }

    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.apiKey,
        "x-goog-fieldmask": "routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: { address: origin.address },
        destination: { address: destination.address },
        intermediates: intermediates.map((item) => ({ address: item.address })),
        travelMode: "WALK",
      }),
    });

    if (!response.ok) {
      throw new Error(`Google Routes API failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as {
      routes?: Array<{ polyline?: { encodedPolyline?: string } }>;
    };

    return {
      polyline: payload.routes?.[0]?.polyline?.encodedPolyline ?? path.join(">"),
      mapUrl: createDemoMapUrl(path),
    };
  }
}

class FirebaseAdminNotifier implements FirebaseNotifier {
  public constructor(private readonly audience?: string) {}

  public async notifyAttendee(attendeeId: string, title: string, body: string): Promise<void> {
    if (!this.audience) {
      return;
    }

    await getMessaging().send({
      topic: `${this.audience}-attendee-${attendeeId}`,
      notification: { title, body },
    });
  }

  public async notifyStaff(zoneId: string, message: string): Promise<void> {
    if (!this.audience) {
      return;
    }

    await getMessaging().send({
      topic: `${this.audience}-staff-${zoneId}`,
      notification: {
        title: `Venue action for ${zoneId}`,
        body: message,
      },
    });
  }
}

class PubSubBus implements GooglePubSubBus {
  public constructor(private readonly pubsub: PubSub, private readonly topicName: string) {}

  public async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
    const message = {
      eventType: topic,
      publishedAt: new Date().toISOString(),
      payload,
    };

    await this.pubsub.topic(this.topicName).publishMessage({
      json: message,
    });
  }
}

class BigQuerySink implements BigQueryAnalyticsSink {
  public constructor(
    private readonly bigQuery: BigQuery,
    private readonly dataset: string,
    private readonly table: string,
  ) {}

  public async writeOptimization(result: OptimizationResult): Promise<void> {
    await this.bigQuery.dataset(this.dataset).table(this.table).insert([
      {
        timestampIso: result.timestampIso,
        zonePressure: JSON.stringify(result.zonePressure),
        attendeeGuidance: JSON.stringify(result.attendeeGuidance ?? null),
        queueRecommendations: JSON.stringify(result.queueRecommendations),
        interventions: JSON.stringify(result.interventions),
      },
    ]);
  }
}

class GoogleWalletUpdater implements GoogleWalletPassUpdater {
  public constructor(
    private readonly auth: GoogleAuth,
    private readonly issuerId: string,
    private readonly classId: string,
  ) {}

  public async updatePass(attendeeId: string, message: string): Promise<void> {
    const token = await getAccessToken(this.auth);
    const objectId = `${this.issuerId}.${attendeeId}`.replace(/[^a-zA-Z0-9._-]/g, "_");

    const response = await fetch(
      `https://walletobjects.googleapis.com/walletobjects/v1/genericObject/${objectId}`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          classId: `${this.issuerId}.${this.classId}`,
          header: {
            defaultValue: {
              language: "en-US",
              value: "PulsePath Live Update",
            },
          },
          textModulesData: [
            {
              id: "venue-guidance",
              header: "Live guidance",
              body: message,
            },
          ],
        }),
      },
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(`Google Wallet API failed with status ${response.status}.`);
    }
  }
}

function createLivePlatform(config: GoogleConfig): GoogleRuntime {
  const projectId = getRequiredConfigValue(config.projectId, "GOOGLE_CLOUD_PROJECT");
  const mapsApiKey = getRequiredConfigValue(config.mapsApiKey, "GOOGLE_MAPS_API_KEY");
  const analyticsDataset = getRequiredConfigValue(config.analyticsDataset, "BIGQUERY_DATASET");
  const analyticsTable = config.analyticsTable ?? "optimizations";
  const pubsubTopic = getRequiredConfigValue(config.pubsubTopic, "PUBSUB_TOPIC");
  const walletIssuerId = getRequiredConfigValue(config.walletIssuerId, "GOOGLE_WALLET_ISSUER_ID");
  const walletClassId = getRequiredConfigValue(config.walletClassId, "GOOGLE_WALLET_CLASS_ID");

  initializeFirebase(config);

  const auth = getGoogleAuth(projectId);
  const pubsub = new PubSub({ projectId });
  const bigQuery = new BigQuery({ projectId });

  return {
    platform: {
      maps: new GoogleMapsPlatformRoutesProvider(mapsApiKey),
      notifications: new FirebaseAdminNotifier(config.firebaseAudience),
      eventBus: new PubSubBus(pubsub, pubsubTopic),
      wallet: new GoogleWalletUpdater(auth, walletIssuerId, walletClassId),
      analytics: new BigQuerySink(bigQuery, analyticsDataset, analyticsTable),
    },
    diagnostics: {
      mode: "live",
      projectId,
      integrations: {
        maps: "configured",
        notifications: "configured",
        pubsub: "configured",
        wallet: "configured",
        analytics: "configured",
      },
    },
  };
}

export function createGoogleRuntime(env: Record<string, string | undefined>): GoogleRuntime {
  const config = createGoogleConfig(env);

  if (config.mode === "live") {
    return createLivePlatform(config);
  }

  const diagnostics: GooglePlatformDiagnostics = {
    mode: "demo",
    integrations: {
      maps: config.mapsApiKey ? "configured" : "demo",
      notifications: config.firebaseAudience ? "configured" : "demo",
      pubsub: config.pubsubTopic ? "configured" : "demo",
      wallet: config.walletIssuerId ? "configured" : "demo",
      analytics: config.analyticsDataset ? "configured" : "demo",
    },
  };

  if (config.projectId !== "demo-project") {
    diagnostics.projectId = config.projectId;
  }

  return {
    platform: new InMemoryGooglePlatform(),
    diagnostics,
  };
}

export function getPlatformDeliverySnapshot(platform: GooglePlatform): Record<string, unknown> {
  if (platform instanceof InMemoryGooglePlatform) {
    return {
      sentNotifications: platform.sentNotifications,
      publishedEvents: platform.publishedEvents,
      walletUpdates: platform.walletUpdates,
      analyticsRows: platform.analyticsRows.length,
    };
  }

  return {
    mode: "live",
    delivery: "Messages are sent to configured Google services directly.",
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
