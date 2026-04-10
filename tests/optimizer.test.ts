import test from "node:test";
import assert from "node:assert/strict";

import { optimizeVenue, estimateWaitMinutes, recommendRoute } from "../src/domain/optimizer.js";
import type { AttendeeProfile, ServicePoint, VenueSnapshot } from "../src/domain/models.js";

const snapshot: VenueSnapshot = {
  venueId: "test-venue",
  timestampIso: "2026-04-11T12:00:00.000Z",
  zones: [
    {
      id: "entry-west",
      name: "Entry West",
      capacity: 1000,
      occupancy: 850,
      inflowPerMinute: 80,
      outflowPerMinute: 20,
      accessibilityScore: 0.95,
      amenities: ["entry"],
    },
    {
      id: "atrium",
      name: "Atrium",
      capacity: 1500,
      occupancy: 700,
      inflowPerMinute: 35,
      outflowPerMinute: 60,
      accessibilityScore: 0.95,
      amenities: ["restroom", "concession"],
    },
    {
      id: "stairs-shortcut",
      name: "Stairs Shortcut",
      capacity: 300,
      occupancy: 90,
      inflowPerMinute: 5,
      outflowPerMinute: 10,
      accessibilityScore: 0.4,
      amenities: [],
    },
    {
      id: "seating-bowl",
      name: "Seating Bowl",
      capacity: 5000,
      occupancy: 4200,
      inflowPerMinute: 50,
      outflowPerMinute: 30,
      accessibilityScore: 0.92,
      amenities: ["seating"],
    },
  ],
  connections: [
    { fromZoneId: "entry-west", toZoneId: "atrium", distanceMeters: 180, stairs: false, accessible: true, covered: true },
    { fromZoneId: "atrium", toZoneId: "seating-bowl", distanceMeters: 240, stairs: false, accessible: true, covered: true },
    { fromZoneId: "entry-west", toZoneId: "stairs-shortcut", distanceMeters: 90, stairs: true, accessible: false, covered: false },
    { fromZoneId: "stairs-shortcut", toZoneId: "seating-bowl", distanceMeters: 80, stairs: true, accessible: false, covered: false },
  ],
  servicePoints: [
    {
      id: "restroom-a",
      zoneId: "atrium",
      name: "Restroom A",
      type: "restroom",
      queueDepth: 48,
      serviceRatePerMinute: 6,
      activeCounters: 1,
      accessibilityReady: true,
    },
    {
      id: "restroom-b",
      zoneId: "atrium",
      name: "Restroom B",
      type: "restroom",
      queueDepth: 12,
      serviceRatePerMinute: 6,
      activeCounters: 1,
      accessibilityReady: true,
    },
  ],
};

test("estimateWaitMinutes reflects throughput safely", () => {
  const servicePoint: ServicePoint = {
    id: "concession-a",
    zoneId: "atrium",
    name: "Concession A",
    type: "concession",
    queueDepth: 30,
    serviceRatePerMinute: 5,
    activeCounters: 2,
    accessibilityReady: true,
  };

  assert.equal(estimateWaitMinutes(servicePoint), 3);
});

test("recommendRoute avoids inaccessible shortcuts for wheelchair users", () => {
  const attendee: AttendeeProfile = {
    id: "fan-1",
    currentZoneId: "entry-west",
    destinationZoneId: "seating-bowl",
    partySize: 1,
    mobilityNeed: "wheelchair",
  };

  const guidance = recommendRoute(snapshot, attendee);
  assert.ok(guidance);
  assert.deepEqual(guidance.route.path, ["entry-west", "atrium", "seating-bowl"]);
});

test("optimizeVenue suggests alternatives and interventions under pressure", () => {
  const result = optimizeVenue(snapshot);
  const restroomA = result.queueRecommendations.find((item) => item.servicePointId === "restroom-a");

  assert.ok(restroomA);
  assert.equal(restroomA.recommendedAlternativeId, "restroom-b");
  assert.ok(result.interventions.length > 0);
  assert.ok(result.interventions.some((item) => item.zoneId === "entry-west"));
});
