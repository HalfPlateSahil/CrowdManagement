# PulsePath Venue Experience System

PulsePath is a venue operations platform designed for large-scale sporting events. It improves the in-person attendee experience by reducing friction across arrival, circulation, concessions, restrooms, and exit flows.

This version is intentionally optimized for production-readiness and review quality:

- schema-validated APIs
- safer dashboard rendering without string-based DOM injection
- clearer venue-level summaries for operators
- demo and live Google integration modes
- deployable serverless structure with local parity

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
- venue-level summary health for operator decision making

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

Then open [http://localhost:3000](http://localhost:3000).

## Local app experience

The local app now includes:

- `GET /api/health` for server health checks
- `GET /api/demo` to load a ready-made venue scenario
- `GET /api/config` to show whether Google integrations are in demo or live mode
- `GET /api/audit` to inspect recent optimization and comparison runs
- `GET /api/metrics` to inspect lightweight operational metrics
- `POST /api/optimize` to submit a snapshot and optional attendee profile
- `POST /api/compare` to compare a candidate venue state against a baseline
- strict schema validation with structured error details on invalid requests
- a browser dashboard in `public/` for live testing without any frontend build step
- Vercel-ready serverless endpoints in `api/` for hosted deployment

## Project structure

- `src/server/http.ts`: HTTP server, safe request parsing, and static file serving
- `src/server/app.ts`: shared app logic used by both local server and deployed APIs
- `src/server/schemas.ts`: typed runtime validation for API payloads
- `src/application/venue-orchestrator.ts`: orchestration layer
- `src/domain/optimizer.ts`: pressure, queue, and intervention logic
- `src/integrations/google.ts`: Google integration contracts, demo runtime, and live Google adapters
- `src/data/demo.ts`: seed data for the dashboard
- `public/index.html`: live dashboard

## Deployment

This repo is now structured so it can be deployed to Vercel directly:

- `public/` is served as static dashboard assets
- `api/health.ts`, `api/demo.ts`, and `api/optimize.ts` run as serverless functions
- `vercel.json` rewrites `/` to the dashboard entry page

### Deploy on Vercel

1. Push this repository to GitHub.
2. Import the repo into Vercel.
3. Keep the default build settings.
4. Add the environment variables listed below in the Vercel project settings.
5. Deploy.

For local development you can still use:

```bash
npm install
npm run dev
```

## Review-oriented improvements

These changes are aimed at stronger technical review scores:

- tighter input validation and safer failure modes
- cleaner domain separation between models, optimization, orchestration, and transport
- better live usability through scenario presets and venue summaries
- compare-mode analysis, audit history, and request envelopes for stronger platform maturity
- clearer deployment and environment setup
- additional automated tests for runtime mode and validation behavior

## Google services setup

The app now supports two modes:

- `GOOGLE_SERVICES_MODE=demo`: safe default, uses in-memory delivery and still shows exactly what would be sent
- `GOOGLE_SERVICES_MODE=live`: uses configured Google services directly

To go live, you will need a Google Cloud project and a few APIs and products enabled.

### 1. Create a Google Cloud project

- Create a project in Google Cloud Console.
- Set billing on the project.
- Create a service account for the backend.
- Download a service account key only if you truly need key-based auth locally. Prefer Application Default Credentials where possible.

### 2. Enable the right services

- Maps JavaScript API or Routes API for routing and venue navigation
- Firebase Cloud Messaging for attendee and staff push notifications
- Cloud Pub/Sub for venue event fan-out
- BigQuery API for analytics storage
- Google Wallet API for live pass updates

### 3. Configure local credentials

Set these environment variables before starting the app or deploying:

```bash
export GOOGLE_SERVICES_MODE="live"
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_MAPS_API_KEY="your-maps-key"
export FIREBASE_AUDIENCE="your-firebase-project-id"
export FIREBASE_SERVICE_ACCOUNT_JSON='{"project_id":"...","client_email":"...","private_key":"..."}'
export PUBSUB_TOPIC="venue-intervention"
export GOOGLE_WALLET_ISSUER_ID="your-wallet-issuer-id"
export GOOGLE_WALLET_CLASS_ID="venue_live_pass"
export BIGQUERY_DATASET="pulsepath_analytics"
export BIGQUERY_TABLE="optimizations"
```

A starter template is included in [.env.example](/Volumes/Crucial%20X9/Projects/Prompt%20Wars/CrowdManagement/.env.example).

If you are using Application Default Credentials locally:

```bash
gcloud auth application-default login
```

### 4. What the live app already does

When `GOOGLE_SERVICES_MODE=live`, the app is wired to:

- call Google Routes API for path enrichment
- send Firebase Cloud Messaging notifications through Firebase Admin
- publish intervention events to a Pub/Sub topic
- write optimization summaries to BigQuery
- attempt Google Wallet object updates for live pass messaging

The dashboard header and `GET /api/config` show which mode is active.

### 5. Suggested production architecture

- Backend API on Cloud Run
- Pub/Sub topics for crowd events and intervention fan-out
- BigQuery tables for snapshots, wait-time history, and intervention outcomes
- Firebase for attendee and staff messaging
- Google Wallet for digital ticket updates
- Maps Platform for route rendering and navigation overlays

### 6. What you still need to build for Google go-live

- auth and authorization for venue operators
- signed ingestion endpoints for sensors and POS events
- per-venue configuration for zones, amenities, and routing rules
- production observability and alerting
- pass-object lifecycle management for Google Wallet object creation before patch updates
- real attendee device-token registration strategy for Firebase topics

## Validation goals

The included tests cover the most important decision paths:

- wait-time estimation
- accessibility-aware routing
- high-pressure intervention generation
- safe Google runtime mode selection
- payload validation and venue summary generation
- explainability, comparison deltas, and audit history behavior

## Production hardening recommendations

- Add authenticated ingestion APIs with signed device payloads.
- Apply schema validation at every external boundary.
- Use idempotent event handling for sensor retries.
- Store operational snapshots with retention and audit controls.
- Add simulation playback for post-incident review.
