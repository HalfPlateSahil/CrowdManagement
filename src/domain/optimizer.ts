import {
  type AttendeeGuidance,
  type AttendeeProfile,
  type Connection,
  type Intervention,
  type OptimizationResult,
  type QueueRecommendation,
  type RouteOption,
  type ServicePoint,
  type VenueSnapshot,
  type Zone,
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

export function estimateWaitMinutes(servicePoint: ServicePoint): number {
  const throughput = Math.max(servicePoint.serviceRatePerMinute * servicePoint.activeCounters, 0.1);
  const baseWait = servicePoint.queueDepth / throughput;
  const servicePenalty = servicePoint.accessibilityReady ? 0 : 1.15;
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
    recommendations.push({
      servicePointId: servicePoint.id,
      estimatedWaitMinutes,
      recommendedAlternativeId:
        bestAlternative && bestAlternative.wait + 3 < estimatedWaitMinutes ? bestAlternative.id : undefined,
    });
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

export function optimizeVenue(
  snapshot: VenueSnapshot,
  attendee?: AttendeeProfile,
): OptimizationResult {
  const zonePressure = Object.fromEntries(
    snapshot.zones.map((zone) => [zone.id, calculateZonePressure(zone)]),
  );
  const queueRecommendations = recommendQueues(snapshot);
  const attendeeGuidance = attendee ? recommendRoute(snapshot, attendee) : undefined;
  const queueGuidance = attendeeGuidance
    ? queueRecommendations.find((item) => item.servicePointId === attendee.destinationZoneId)
    : undefined;

  return {
    timestampIso: snapshot.timestampIso,
    zonePressure,
    attendeeGuidance:
      attendeeGuidance && queueGuidance
        ? { ...attendeeGuidance, queueRecommendation: queueGuidance }
        : attendeeGuidance,
    queueRecommendations,
    interventions: generateInterventions(snapshot),
  };
}
