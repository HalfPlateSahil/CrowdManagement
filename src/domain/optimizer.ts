import {
  type AttendeeGuidance,
  type AttendeeProfile,
  type Connection,
  type Intervention,
  type OptimizationResult,
  type QueueRecommendation,
  type RouteOption,
  type ServicePoint,
  type VenueSummary,
  type VenueSnapshot,
  type Zone,
  type ZoneHotspot,
} from "./models.js";

const MAX_PATH_DEPTH = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function calculateZonePressure(zone: Zone): number {
  const occupancyRatio = zone.capacity === 0 ? 1 : zone.occupancy / zone.capacity;
  const flowImbalance = zone.inflowPerMinute - zone.outflowPerMinute;
  const flowPressure = clamp(flowImbalance / Math.max(zone.capacity * 0.05, 1), -1, 1);

  return Number(clamp((occupancyRatio * 0.7) + ((flowPressure + 1) * 0.15), 0, 1.5).toFixed(3));
}

function pressureSeverity(pressure: number): ZoneHotspot["severity"] {
  if (pressure >= 1.05) {
    return "critical";
  }
  if (pressure >= 0.9) {
    return "high";
  }
  if (pressure >= 0.7) {
    return "elevated";
  }
  return "healthy";
}

export function estimateWaitMinutes(servicePoint: ServicePoint): number {
  const throughput = Math.max(servicePoint.serviceRatePerMinute * servicePoint.activeCounters, 0.1);
  const baseWait = servicePoint.queueDepth / throughput;
  const servicePenalty = servicePoint.accessibilityReady ? 1 : 1.15;
  return Number((baseWait * servicePenalty).toFixed(1));
}

function buildZoneMap(snapshot: VenueSnapshot): Map<string, Zone> {
  return new Map(snapshot.zones.map((zone) => [zone.id, zone]));
}

function buildConnectionsByZone(connections: Connection[]): Map<string, Connection[]> {
  const index = new Map<string, Connection[]>();

  for (const connection of connections) {
    const entry = index.get(connection.fromZoneId);
    if (entry) {
      entry.push(connection);
    } else {
      index.set(connection.fromZoneId, [connection]);
    }
  }

  return index;
}

function scoreRoute(
  path: string[],
  snapshot: VenueSnapshot,
  attendee: AttendeeProfile,
  zonePressure: Record<string, number>,
): RouteOption | undefined {
  const zoneMap = buildZoneMap(snapshot);
  let distanceMeters = 0;
  let totalPressure = 0;
  let accessible = true;

  for (let index = 0; index < path.length - 1; index += 1) {
    const fromZoneId = path[index];
    const toZoneId = path[index + 1];
    const connection = snapshot.connections.find(
      (item) => item.fromZoneId === fromZoneId && item.toZoneId === toZoneId,
    );

    if (!connection) {
      return undefined;
    }

    distanceMeters += connection.distanceMeters;
    if (attendee.mobilityNeed !== "standard" && (!connection.accessible || connection.stairs)) {
      accessible = false;
    }
  }

  for (const zoneId of path) {
    totalPressure += zonePressure[zoneId] ?? 1;
    const zone = zoneMap.get(zoneId);
    if (attendee.mobilityNeed !== "standard" && zone && zone.accessibilityScore < 0.6) {
      accessible = false;
    }
  }

  if (attendee.mobilityNeed !== "standard" && !accessible) {
    return undefined;
  }

  const walkSpeedMetersPerMinute = attendee.mobilityNeed === "standard" ? 78 : 55;
  const estimatedMinutes = Number((distanceMeters / walkSpeedMetersPerMinute).toFixed(1));
  const averagePressure = Number((totalPressure / path.length).toFixed(3));

  return {
    path,
    estimatedMinutes,
    averagePressure,
    accessible,
    distanceMeters,
  };
}

function enumerateRoutes(snapshot: VenueSnapshot, attendee: AttendeeProfile): RouteOption[] {
  const zonePressure = Object.fromEntries(
    snapshot.zones.map((zone) => [zone.id, calculateZonePressure(zone)]),
  );
  const connectionsByZone = buildConnectionsByZone(snapshot.connections);
  const routes: RouteOption[] = [];
  const stack: string[][] = [[attendee.currentZoneId]];

  while (stack.length > 0) {
    const path = stack.pop();
    if (!path) {
      continue;
    }

    const currentZoneId = path[path.length - 1];
    if (!currentZoneId) {
      continue;
    }
    if (currentZoneId === attendee.destinationZoneId) {
      const route = scoreRoute(path, snapshot, attendee, zonePressure);
      if (route) {
        routes.push(route);
      }
      continue;
    }

    if (path.length > MAX_PATH_DEPTH) {
      continue;
    }

    const neighbors = connectionsByZone.get(currentZoneId) ?? [];
    for (const neighbor of neighbors) {
      if (!path.includes(neighbor.toZoneId)) {
        stack.push([...path, neighbor.toZoneId]);
      }
    }
  }

  return routes.sort((left, right) => {
    const leftScore = left.averagePressure * 5 + left.estimatedMinutes;
    const rightScore = right.averagePressure * 5 + right.estimatedMinutes;

    if (attendee.prefersShortestWalk) {
      return left.estimatedMinutes - right.estimatedMinutes || left.averagePressure - right.averagePressure;
    }

    return leftScore - rightScore;
  });
}

export function recommendRoute(
  snapshot: VenueSnapshot,
  attendee: AttendeeProfile,
): AttendeeGuidance | undefined {
  const routes = enumerateRoutes(snapshot, attendee);
  const bestRoute = routes[0];

  if (!bestRoute) {
    return undefined;
  }

  return {
    attendeeId: attendee.id,
    route: bestRoute,
    rationale:
      bestRoute.averagePressure > 0.85
        ? "This path is the safest currently available option under heavy venue pressure."
        : "This path balances low congestion, accessibility, and walking time.",
  };
}

export function recommendQueues(snapshot: VenueSnapshot): QueueRecommendation[] {
  const byType = new Map<ServicePoint["type"], ServicePoint[]>();

  for (const servicePoint of snapshot.servicePoints) {
    const group = byType.get(servicePoint.type);
    if (group) {
      group.push(servicePoint);
    } else {
      byType.set(servicePoint.type, [servicePoint]);
    }
  }

  const recommendations: QueueRecommendation[] = [];

  for (const servicePoint of snapshot.servicePoints) {
    const estimatedWaitMinutes = estimateWaitMinutes(servicePoint);
    const alternatives = (byType.get(servicePoint.type) ?? [])
      .filter((candidate) => candidate.id !== servicePoint.id)
      .map((candidate) => ({
        id: candidate.id,
        wait: estimateWaitMinutes(candidate),
      }))
      .sort((left, right) => left.wait - right.wait);

    const bestAlternative = alternatives[0];
    const recommendation: QueueRecommendation = {
      servicePointId: servicePoint.id,
      estimatedWaitMinutes,
    };

    if (bestAlternative && bestAlternative.wait + 3 < estimatedWaitMinutes) {
      recommendation.recommendedAlternativeId = bestAlternative.id;
    }

    recommendations.push(recommendation);
  }

  return recommendations;
}

export function generateInterventions(snapshot: VenueSnapshot): Intervention[] {
  const interventions: Intervention[] = [];

  for (const zone of snapshot.zones) {
    const pressure = calculateZonePressure(zone);

    if (pressure >= 1.05) {
      interventions.push({
        type: "staffing",
        priority: "critical",
        zoneId: zone.id,
        targetGroup: "staff",
        message: `Deploy crowd marshals to ${zone.name} and open overflow lanes immediately.`,
      });
      interventions.push({
        type: "signage",
        priority: "critical",
        zoneId: zone.id,
        targetGroup: "attendees",
        message: `Update nearby signage to divert fans away from ${zone.name}.`,
      });
    } else if (pressure >= 0.9) {
      interventions.push({
        type: "reroute",
        priority: "high",
        zoneId: zone.id,
        targetGroup: "all",
        message: `Begin soft rerouting around ${zone.name} before congestion escalates.`,
      });
    }
  }

  for (const servicePoint of snapshot.servicePoints) {
    const wait = estimateWaitMinutes(servicePoint);
    if (wait >= 12) {
      interventions.push({
        type: "broadcast",
        priority: "medium",
        zoneId: servicePoint.zoneId,
        targetGroup: "attendees",
        message: `${servicePoint.name} is experiencing a ${wait}-minute wait. Recommend alternative facilities nearby.`,
      });
    }
  }

  return interventions;
}

export function summarizeVenue(
  zonePressure: Record<string, number>,
  queueRecommendations: QueueRecommendation[],
  interventions: Intervention[],
): VenueSummary {
  const hotspots = Object.entries(zonePressure)
    .map(([zoneId, pressure]) => ({
      zoneId,
      pressure,
      severity: pressureSeverity(pressure),
    }))
    .sort((left, right) => right.pressure - left.pressure);
  const averageZonePressure =
    hotspots.length === 0
      ? 0
      : Number((hotspots.reduce((sum, item) => sum + item.pressure, 0) / hotspots.length).toFixed(3));
  const busiestZone = hotspots[0];
  const highestPredictedWaitMinutes =
    queueRecommendations.length === 0
      ? 0
      : Math.max(...queueRecommendations.map((item) => item.estimatedWaitMinutes));
  const venueStatus: VenueSummary["venueStatus"] =
    interventions.some((item) => item.priority === "critical")
      ? "intervene"
      : interventions.some((item) => item.priority === "high") || highestPredictedWaitMinutes >= 10
        ? "watch"
        : "stable";

  const insight =
    venueStatus === "intervene"
      ? `Immediate intervention is recommended around ${busiestZone?.zoneId ?? "the venue"} to reduce congestion buildup.`
      : venueStatus === "watch"
        ? `Venue conditions are manageable, but ${busiestZone?.zoneId ?? "key zones"} should be monitored closely.`
        : "Venue conditions are stable and attendee movement appears healthy.";

  const summary: VenueSummary = {
    venueStatus,
    averageZonePressure,
    highestPredictedWaitMinutes,
    hotspots: hotspots.slice(0, 5),
    recommendedActionCount: interventions.length,
    insight,
  };

  if (busiestZone) {
    summary.busiestZoneId = busiestZone.zoneId;
  }

  return summary;
}

export function optimizeVenue(
  snapshot: VenueSnapshot,
  attendee?: AttendeeProfile,
): OptimizationResult {
  const zonePressure = Object.fromEntries(
    snapshot.zones.map((zone) => [zone.id, calculateZonePressure(zone)]),
  );
  const queueRecommendations = recommendQueues(snapshot);
  const attendeeGuidance = attendee ? recommendRoute(snapshot, attendee) : undefined;
  const interventions = generateInterventions(snapshot);
  const result: OptimizationResult = {
    timestampIso: snapshot.timestampIso,
    zonePressure,
    queueRecommendations,
    interventions,
    summary: summarizeVenue(zonePressure, queueRecommendations, interventions),
  };

  if (attendeeGuidance) {
    result.attendeeGuidance = attendeeGuidance;
  }

  return result;
}
