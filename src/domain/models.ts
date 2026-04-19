export type MobilityNeed = "standard" | "wheelchair" | "low-vision" | "hearing-support";

export interface AttendeeProfile {
  id: string;
  currentZoneId: string;
  destinationZoneId: string;
  partySize: number;
  mobilityNeed: MobilityNeed;
  prefersShortestWalk?: boolean;
}

export interface Zone {
  id: string;
  name: string;
  capacity: number;
  occupancy: number;
  inflowPerMinute: number;
  outflowPerMinute: number;
  accessibilityScore: number;
  amenities: string[];
}

export interface Connection {
  fromZoneId: string;
  toZoneId: string;
  distanceMeters: number;
  stairs: boolean;
  accessible: boolean;
  covered: boolean;
}

export interface ServicePoint {
  id: string;
  zoneId: string;
  name: string;
  type: "concession" | "restroom" | "merch" | "security" | "entry";
  queueDepth: number;
  serviceRatePerMinute: number;
  activeCounters: number;
  accessibilityReady: boolean;
}

export interface VenueSnapshot {
  venueId: string;
  timestampIso: string;
  zones: Zone[];
  connections: Connection[];
  servicePoints: ServicePoint[];
}

export interface RouteOption {
  path: string[];
  estimatedMinutes: number;
  averagePressure: number;
  accessible: boolean;
  distanceMeters: number;
}

export interface QueueRecommendation {
  servicePointId: string;
  estimatedWaitMinutes: number;
  recommendedAlternativeId?: string;
  confidenceScore?: number;
  explanation?: string;
}

export interface ZoneHotspot {
  zoneId: string;
  pressure: number;
  severity: "healthy" | "elevated" | "high" | "critical";
}

export interface VenueSummary {
  venueStatus: "stable" | "watch" | "intervene";
  averageZonePressure: number;
  busiestZoneId?: string;
  highestPredictedWaitMinutes: number;
  hotspots: ZoneHotspot[];
  recommendedActionCount: number;
  insight: string;
}

export interface Intervention {
  type: "reroute" | "staffing" | "signage" | "wallet-update" | "broadcast";
  priority: "critical" | "high" | "medium";
  zoneId: string;
  message: string;
  targetGroup: "attendees" | "staff" | "all";
  confidenceScore?: number;
  rationale?: string;
}

export interface AttendeeGuidance {
  attendeeId: string;
  route: RouteOption;
  rationale: string;
  queueRecommendation?: QueueRecommendation;
  confidenceScore?: number;
  alternatives?: RouteOption[];
}

export interface OptimizationResult {
  timestampIso: string;
  zonePressure: Record<string, number>;
  attendeeGuidance?: AttendeeGuidance;
  queueRecommendations: QueueRecommendation[];
  interventions: Intervention[];
  summary: VenueSummary;
  explainability: {
    confidenceScore: number;
    assumptions: string[];
    reasons: string[];
  };
}

export interface OptimizationDelta {
  averagePressureDelta: number;
  highestWaitDelta: number;
  actionCountDelta: number;
  improvedHotspots: string[];
  worsenedHotspots: string[];
  conclusion: string;
}

export interface OptimizationComparison {
  baseline: OptimizationResult;
  candidate: OptimizationResult;
  delta: OptimizationDelta;
}

export interface AuditRecord {
  requestId: string;
  createdAtIso: string;
  venueId: string;
  mode: "optimize" | "compare";
  venueStatus: VenueSummary["venueStatus"];
  confidenceScore: number;
  actionCount: number;
  busiestZoneId?: string;
}
