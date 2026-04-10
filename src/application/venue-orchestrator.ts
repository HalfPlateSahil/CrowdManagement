import type { AttendeeProfile, OptimizationResult, VenueSnapshot } from "../domain/models.js";
import { optimizeVenue } from "../domain/optimizer.js";
import { broadcastInterventions, notifyGuidance, type GooglePlatform } from "../integrations/google.js";

export class VenueOrchestrator {
  public constructor(private readonly platform: GooglePlatform) {}

  public async runOptimization(
    snapshot: VenueSnapshot,
    attendee?: AttendeeProfile,
  ): Promise<OptimizationResult> {
    const result = optimizeVenue(snapshot, attendee);

    await this.platform.analytics.writeOptimization(result);
    await broadcastInterventions(this.platform, result.interventions);

    if (result.attendeeGuidance) {
      await notifyGuidance(this.platform, result.attendeeGuidance);
    }

    return result;
  }
}
