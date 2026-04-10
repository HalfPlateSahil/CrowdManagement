import test from "node:test";
import assert from "node:assert/strict";

import { createGoogleConfig, createGoogleRuntime, InMemoryGooglePlatform } from "../src/integrations/google.js";

test("createGoogleConfig defaults to demo mode safely", () => {
  const config = createGoogleConfig({});

  assert.equal(config.mode, "demo");
  assert.equal(config.projectId, "demo-project");
});

test("createGoogleRuntime returns demo platform by default", () => {
  const runtime = createGoogleRuntime({});

  assert.equal(runtime.diagnostics.mode, "demo");
  assert.ok(runtime.platform instanceof InMemoryGooglePlatform);
  assert.equal(runtime.diagnostics.integrations.maps, "demo");
});

test("createGoogleRuntime marks configured demo integrations from env", () => {
  const runtime = createGoogleRuntime({
    GOOGLE_MAPS_API_KEY: "maps-key",
    FIREBASE_AUDIENCE: "firebase-project",
    PUBSUB_TOPIC: "venue-events",
    BIGQUERY_DATASET: "analytics",
    GOOGLE_WALLET_ISSUER_ID: "issuer-id",
  });

  assert.equal(runtime.diagnostics.mode, "demo");
  assert.equal(runtime.diagnostics.integrations.maps, "configured");
  assert.equal(runtime.diagnostics.integrations.notifications, "configured");
  assert.equal(runtime.diagnostics.integrations.pubsub, "configured");
  assert.equal(runtime.diagnostics.integrations.analytics, "configured");
  assert.equal(runtime.diagnostics.integrations.wallet, "configured");
});
