# PulsePath Venue Experience System

PulsePath is a venue operations platform designed for large-scale sporting events. It improves the in-person attendee experience by reducing friction across arrival, circulation, concessions, restrooms, and exit flows.

## Why this system is different

Most event tooling reports crowding after it happens. PulsePath is built around anticipatory coordination:

- Predicts pressure before a zone fails using live occupancy, flow imbalance, and queue throughput.
- Recommends the best next action for both attendees and operations teams.
- Coordinates the same decision across mobile, staff tools, and digital signage.
- Uses Google services where they fit naturally instead of bolting them on as an afterthought.

## Core experience

The solution treats the venue like a living network of zones and service points.

- Attendees receive context-aware routing to gates, seats, restrooms, concessions, and exits.
- Operations teams get targeted interventions such as opening overflow lanes, redeploying staff, or changing signage.
- Queue hotspots are handled by routing people toward nearby alternatives before a crush forms.
- Accessibility needs are first-class, not a separate fallback path.

## System design

### 1. Sensing and ingestion

Inputs can come from turnstiles, POS systems, CCTV analytics, Wi-Fi density estimates, manual staff reports, shuttle feeds, and parking systems.

### 2. Venue intelligence layer

The engine in `src/domain/optimizer.ts` scores:

- zone pressure
- queue wait times
- rerouting opportunities
- staffing and signage interventions

### 3. Real-time coordination

The application layer in `src/application/venue-orchestrator.ts` turns decisions into:

- attendee guidance
- staff actions
- signage updates
- analytics events

### 4. Google integrations

The adapters in `src/integrations/google.ts` show how the platform fits with Google services:

- Google Maps Platform: route geometry and path guidance
- Firebase Cloud Messaging: real-time attendee and staff notifications
- Google Cloud Pub/Sub: operational event distribution
- Google Wallet: live pass updates for gate changes or timing nudges
- BigQuery: post-event analytics and capacity planning

## Example attendee flows

### Arrival

If Gate A exceeds healthy density, the system can:

- reroute fans to Gate C
- update digital passes with the new recommendation
- notify ushers near Gate A to create a split queue

### Mid-game congestion

If a restroom cluster spikes during halftime, the system can:

- redirect nearby fans to a lower-wait facility
- update concourse signage
- trigger cleaning or staff support if service degradation is detected

### Exit

If parking or rail access becomes saturated, the system can:

- stagger exit recommendations by section
- route fans to safer corridors
- sync guidance with transport operators

## Local usage

```bash
npm install
npm test
npm run start
```

## Validation goals

The included tests cover the most important decision paths:

- wait-time estimation
- accessibility-aware routing
- high-pressure intervention generation

## Production hardening recommendations

- Add authenticated ingestion APIs with signed device payloads.
- Apply schema validation at every external boundary.
- Use idempotent event handling for sensor retries.
- Store operational snapshots with retention and audit controls.
- Add simulation playback for post-incident review.
