import { VenueOrchestrator } from "./application/venue-orchestrator.js";
import type { AttendeeProfile, VenueSnapshot } from "./domain/models.js";
import { InMemoryGooglePlatform } from "./integrations/google.js";

const snapshot: VenueSnapshot = {
  venueId: "stadium-01",
  timestampIso: new Date().toISOString(),
  zones: [
    {
      id: "gate-a",
      name: "Gate A",
      capacity: 1800,
      occupancy: 1700,
      inflowPerMinute: 140,
      outflowPerMinute: 70,
      accessibilityScore: 0.84,
      amenities: ["entry", "security"],
    },
    {
      id: "gate-c",
      name: "Gate C",
      capacity: 1600,
      occupancy: 700,
      inflowPerMinute: 45,
      outflowPerMinute: 60,
      accessibilityScore: 0.95,
      amenities: ["entry", "security"],
    },
    {
      id: "main-concourse",
      name: "Main Concourse",
      capacity: 2400,
      occupancy: 1650,
      inflowPerMinute: 120,
      outflowPerMinute: 115,
      accessibilityScore: 0.9,
      amenities: ["concession", "restroom", "merch"],
    },
    {
      id: "section-120",
      name: "Section 120",
      capacity: 850,
      occupancy: 680,
      inflowPerMinute: 24,
      outflowPerMinute: 10,
      accessibilityScore: 0.88,
      amenities: ["seating"],
    },
  ],
  connections: [
    { fromZoneId: "gate-a", toZoneId: "main-concourse", distanceMeters: 220, stairs: false, accessible: true, covered: true },
    { fromZoneId: "gate-c", toZoneId: "main-concourse", distanceMeters: 250, stairs: false, accessible: true, covered: true },
    { fromZoneId: "main-concourse", toZoneId: "section-120", distanceMeters: 160, stairs: false, accessible: true, covered: true },
    { fromZoneId: "gate-a", toZoneId: "section-120", distanceMeters: 190, stairs: true, accessible: false, covered: false },
  ],
  servicePoints: [
    {
      id: "restroom-east",
      zoneId: "main-concourse",
      name: "East Restroom",
      type: "restroom",
      queueDepth: 52,
      serviceRatePerMinute: 7,
      activeCounters: 1,
      accessibilityReady: true,
    },
    {
      id: "restroom-west",
      zoneId: "main-concourse",
      name: "West Restroom",
      type: "restroom",
      queueDepth: 15,
      serviceRatePerMinute: 7,
      activeCounters: 1,
      accessibilityReady: true,
    },
    {
      id: "nachos-01",
      zoneId: "main-concourse",
      name: "Nacho Stand 01",
      type: "concession",
      queueDepth: 36,
      serviceRatePerMinute: 4,
      activeCounters: 2,
      accessibilityReady: true,
    },
  ],
};

const attendee: AttendeeProfile = {
  id: "attendee-44",
  currentZoneId: "gate-a",
  destinationZoneId: "section-120",
  partySize: 2,
  mobilityNeed: "wheelchair",
};

async function main(): Promise<void> {
  const platform = new InMemoryGooglePlatform();
  const orchestrator = new VenueOrchestrator(platform);
  const result = await orchestrator.runOptimization(snapshot, attendee);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`PulsePath failed: ${message}`);
  process.exitCode = 1;
});
