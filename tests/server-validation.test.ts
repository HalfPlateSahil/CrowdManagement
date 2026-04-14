import test from "node:test";
import assert from "node:assert/strict";

import { optimizeVenue } from "../src/domain/optimizer.js";
import { demoSnapshot } from "../src/data/demo.js";
import { optimizationRequestSchema } from "../src/server/schemas.js";

test("optimization request schema rejects unknown zone references", () => {
  const invalidSnapshot = {
    ...demoSnapshot,
    connections: [
      ...demoSnapshot.connections,
      {
        fromZoneId: "missing-zone",
        toZoneId: "main-concourse",
        distanceMeters: 100,
        stairs: false,
        accessible: true,
        covered: true,
      },
    ],
  };

  const parsed = optimizationRequestSchema.safeParse({
    snapshot: invalidSnapshot,
  });

  assert.equal(parsed.success, false);
});

test("optimization result includes a review-friendly venue summary", () => {
  const result = optimizeVenue(demoSnapshot);

  assert.ok(result.summary);
  assert.ok(["stable", "watch", "intervene"].includes(result.summary.venueStatus));
  assert.ok(typeof result.summary.insight === "string" && result.summary.insight.length > 0);
  assert.ok(Array.isArray(result.summary.hotspots));
});
