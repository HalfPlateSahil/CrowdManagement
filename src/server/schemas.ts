import { z } from "zod";

const mobilityNeedSchema = z.enum(["standard", "wheelchair", "low-vision", "hearing-support"]);

export const attendeeProfileSchema = z.object({
  id: z.string().min(1).max(128),
  currentZoneId: z.string().min(1).max(128),
  destinationZoneId: z.string().min(1).max(128),
  partySize: z.number().int().min(1).max(20),
  mobilityNeed: mobilityNeedSchema,
  prefersShortestWalk: z.boolean().optional(),
});

export const zoneSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(160),
  capacity: z.number().min(1).max(1_000_000),
  occupancy: z.number().min(0).max(1_000_000),
  inflowPerMinute: z.number().min(0).max(100_000),
  outflowPerMinute: z.number().min(0).max(100_000),
  accessibilityScore: z.number().min(0).max(1),
  amenities: z.array(z.string().min(1).max(64)).max(50),
});

export const connectionSchema = z.object({
  fromZoneId: z.string().min(1).max(128),
  toZoneId: z.string().min(1).max(128),
  distanceMeters: z.number().min(1).max(100_000),
  stairs: z.boolean(),
  accessible: z.boolean(),
  covered: z.boolean(),
});

export const servicePointSchema = z.object({
  id: z.string().min(1).max(128),
  zoneId: z.string().min(1).max(128),
  name: z.string().min(1).max(160),
  type: z.enum(["concession", "restroom", "merch", "security", "entry"]),
  queueDepth: z.number().min(0).max(100_000),
  serviceRatePerMinute: z.number().positive().max(10_000),
  activeCounters: z.number().int().min(1).max(500),
  accessibilityReady: z.boolean(),
});

export const venueSnapshotSchema = z
  .object({
    venueId: z.string().min(1).max(128),
    timestampIso: z.string().datetime({ offset: true }),
    zones: z.array(zoneSchema).min(1).max(500),
    connections: z.array(connectionSchema).max(5_000),
    servicePoints: z.array(servicePointSchema).max(5_000),
  })
  .superRefine((snapshot, context) => {
    const zoneIds = new Set(snapshot.zones.map((zone) => zone.id));

    for (const zone of snapshot.zones) {
      if (zone.occupancy > zone.capacity) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["zones"],
          message: `Zone ${zone.id} has occupancy greater than capacity.`,
        });
      }
    }

    for (const connection of snapshot.connections) {
      if (!zoneIds.has(connection.fromZoneId) || !zoneIds.has(connection.toZoneId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["connections"],
          message: `Connection ${connection.fromZoneId} -> ${connection.toZoneId} references unknown zones.`,
        });
      }
    }

    for (const servicePoint of snapshot.servicePoints) {
      if (!zoneIds.has(servicePoint.zoneId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["servicePoints"],
          message: `Service point ${servicePoint.id} references unknown zone ${servicePoint.zoneId}.`,
        });
      }
    }
  });

export const optimizationRequestSchema = z.object({
  snapshot: venueSnapshotSchema,
  attendee: attendeeProfileSchema.optional(),
});

export const optimizationComparisonSchema = z.object({
  baselineSnapshot: venueSnapshotSchema,
  candidateSnapshot: venueSnapshotSchema,
  attendee: attendeeProfileSchema.optional(),
});

export type OptimizationRequestInput = z.infer<typeof optimizationRequestSchema>;
export type OptimizationComparisonInput = z.infer<typeof optimizationComparisonSchema>;
