const snapshotInput = document.querySelector("#snapshot-input");
const attendeeInput = document.querySelector("#attendee-input");
const zonePressure = document.querySelector("#zone-pressure");
const queueRecommendations = document.querySelector("#queue-recommendations");
const attendeeGuidance = document.querySelector("#attendee-guidance");
const interventions = document.querySelector("#interventions");
const deliveryPreview = document.querySelector("#delivery-preview");
const integrationMode = document.querySelector("#integration-mode");
const venueSummary = document.querySelector("#venue-summary");
const hotspots = document.querySelector("#hotspots");
const explainability = document.querySelector("#explainability");
const auditTrail = document.querySelector("#audit-trail");
const comparisonOutput = document.querySelector("#comparison-output");
const loadDemoButton = document.querySelector("#load-demo");
const runButton = document.querySelector("#run-optimization");
const compareButton = document.querySelector("#compare-scenarios");
const scenarioSelect = document.querySelector("#scenario-select");

const scenarios = {
  demo: null,
  halftime: {
    snapshot: {
      venueId: "stadium-halftime",
      timestampIso: new Date().toISOString(),
      zones: [
        { id: "bowl-north", name: "North Bowl", capacity: 2500, occupancy: 2200, inflowPerMinute: 95, outflowPerMinute: 60, accessibilityScore: 0.92, amenities: ["seating"] },
        { id: "main-concourse", name: "Main Concourse", capacity: 2600, occupancy: 2300, inflowPerMinute: 180, outflowPerMinute: 95, accessibilityScore: 0.94, amenities: ["restroom", "concession"] },
        { id: "restroom-court", name: "Restroom Court", capacity: 900, occupancy: 820, inflowPerMinute: 75, outflowPerMinute: 42, accessibilityScore: 0.88, amenities: ["restroom"] },
      ],
      connections: [
        { fromZoneId: "bowl-north", toZoneId: "main-concourse", distanceMeters: 150, stairs: false, accessible: true, covered: true },
        { fromZoneId: "main-concourse", toZoneId: "restroom-court", distanceMeters: 90, stairs: false, accessible: true, covered: true },
      ],
      servicePoints: [
        { id: "restroom-a", zoneId: "restroom-court", name: "Restroom A", type: "restroom", queueDepth: 84, serviceRatePerMinute: 7, activeCounters: 1, accessibilityReady: true },
        { id: "restroom-b", zoneId: "main-concourse", name: "Restroom B", type: "restroom", queueDepth: 22, serviceRatePerMinute: 8, activeCounters: 1, accessibilityReady: true },
        { id: "food-a", zoneId: "main-concourse", name: "Food Hall A", type: "concession", queueDepth: 65, serviceRatePerMinute: 5, activeCounters: 2, accessibilityReady: true },
      ],
    },
    attendee: {
      id: "fan-halftime",
      currentZoneId: "bowl-north",
      destinationZoneId: "restroom-court",
      partySize: 2,
      mobilityNeed: "standard",
    },
  },
  exit: {
    snapshot: {
      venueId: "stadium-exit",
      timestampIso: new Date().toISOString(),
      zones: [
        { id: "section-210", name: "Section 210", capacity: 1100, occupancy: 950, inflowPerMinute: 35, outflowPerMinute: 90, accessibilityScore: 0.9, amenities: ["seating"] },
        { id: "east-ramp", name: "East Ramp", capacity: 1000, occupancy: 970, inflowPerMinute: 120, outflowPerMinute: 60, accessibilityScore: 0.83, amenities: ["exit"] },
        { id: "south-plaza", name: "South Plaza", capacity: 2400, occupancy: 1300, inflowPerMinute: 55, outflowPerMinute: 85, accessibilityScore: 0.96, amenities: ["exit", "transport"] },
        { id: "rail-link", name: "Rail Link", capacity: 1600, occupancy: 980, inflowPerMinute: 70, outflowPerMinute: 62, accessibilityScore: 0.97, amenities: ["transport"] },
      ],
      connections: [
        { fromZoneId: "section-210", toZoneId: "east-ramp", distanceMeters: 110, stairs: false, accessible: true, covered: true },
        { fromZoneId: "east-ramp", toZoneId: "south-plaza", distanceMeters: 180, stairs: false, accessible: true, covered: true },
        { fromZoneId: "south-plaza", toZoneId: "rail-link", distanceMeters: 240, stairs: false, accessible: true, covered: false },
      ],
      servicePoints: [
        { id: "gate-scan-east", zoneId: "east-ramp", name: "East Exit Security", type: "security", queueDepth: 42, serviceRatePerMinute: 10, activeCounters: 2, accessibilityReady: true },
      ],
    },
    attendee: {
      id: "fan-exit",
      currentZoneId: "section-210",
      destinationZoneId: "rail-link",
      partySize: 4,
      mobilityNeed: "low-vision",
    },
  },
};

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function pressureTone(value) {
  if (value >= 1.05) return "Critical";
  if (value >= 0.9) return "High";
  if (value >= 0.7) return "Elevated";
  return "Healthy";
}

function createMetricCard(title, rows, badgeText) {
  const card = document.createElement("div");
  card.className = "metric";
  const titleRow = document.createElement("div");
  titleRow.className = "metric-title";
  const strong = document.createElement("strong");
  strong.textContent = title;
  titleRow.append(strong);
  if (badgeText) {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = badgeText;
    titleRow.append(pill);
  }
  card.append(titleRow);
  for (const rowText of rows) {
    const row = document.createElement("div");
    row.textContent = rowText;
    card.append(row);
  }
  return card;
}

function renderNodeList(container, nodes, emptyText, className = "metric-list") {
  container.replaceChildren();
  if (!nodes.length) {
    container.className = `${className} empty`;
    container.textContent = emptyText;
    return;
  }
  container.className = className;
  for (const node of nodes) container.append(node);
}

async function fetchJson(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  return { response, data };
}

async function loadDemo() {
  const { data } = await fetchJson("/api/demo");
  snapshotInput.value = formatJson(data.snapshot);
  attendeeInput.value = formatJson(data.attendee);
}

async function loadConfig() {
  const { data } = await fetchJson("/api/config");
  const diagnostics = data.diagnostics;
  const integrations = diagnostics.integrations;
  integrationMode.textContent =
    diagnostics.mode === "live"
      ? `Live Google mode · ${diagnostics.projectId ?? "project configured"}`
      : `Demo mode · Maps ${integrations.maps}, Firebase ${integrations.notifications}, Pub/Sub ${integrations.pubsub}`;
}

async function loadAudit() {
  const { data } = await fetchJson("/api/audit");
  renderNodeList(
    auditTrail,
    (data.runs ?? []).map((item) =>
      createMetricCard(
        `${item.mode.toUpperCase()} · ${item.venueId}`,
        [
          `Status: ${item.venueStatus}`,
          `Confidence: ${item.confidenceScore}`,
          `Actions: ${item.actionCount}`,
          `Request ID: ${item.requestId}`,
        ],
        item.busiestZoneId ?? "no hotspot",
      ),
    ),
    "Recent runs will appear here.",
  );
}

function loadScenario(choice) {
  if (choice === "demo") return loadDemo();
  const scenario = scenarios[choice];
  snapshotInput.value = formatJson(scenario.snapshot);
  attendeeInput.value = formatJson(scenario.attendee);
  return Promise.resolve();
}

function renderResult(payload) {
  const { result, delivery, diagnostics, requestId } = payload;
  renderNodeList(
    venueSummary,
    [
      createMetricCard(
        "Venue status",
        [
          `Status: ${result.summary.venueStatus}`,
          `Average pressure: ${result.summary.averageZonePressure}`,
          `Highest predicted wait: ${result.summary.highestPredictedWaitMinutes} minutes`,
          result.summary.insight,
        ],
        `${result.summary.recommendedActionCount} actions`,
      ),
    ],
    "Venue-level insight will appear here.",
  );
  renderNodeList(
    hotspots,
    result.summary.hotspots.map((item) => createMetricCard(item.zoneId, [`Pressure: ${item.pressure}`], item.severity)),
    "Hotspots will appear here.",
  );
  renderNodeList(
    zonePressure,
    Object.entries(result.zonePressure).map(([zoneId, pressure]) =>
      createMetricCard(zoneId, [`Pressure score: ${pressure}`], pressureTone(Number(pressure))),
    ),
    "Run a scenario to see zone pressure.",
  );
  renderNodeList(
    queueRecommendations,
    result.queueRecommendations.map((item) =>
      createMetricCard(item.servicePointId, [
        `Estimated wait: ${item.estimatedWaitMinutes} minutes`,
        `Alternative: ${item.recommendedAlternativeId ?? "No better alternative nearby"}`,
        `Confidence: ${item.confidenceScore ?? "n/a"}`,
        item.explanation ?? "No additional explanation available.",
      ]),
    ),
    "Queue guidance will appear here.",
  );
  renderNodeList(
    attendeeGuidance,
    result.attendeeGuidance
      ? [
          createMetricCard(result.attendeeGuidance.attendeeId, [
            `Path: ${result.attendeeGuidance.route.path.join(" -> ")}`,
            `Walk time: ${result.attendeeGuidance.route.estimatedMinutes} minutes`,
            `Confidence: ${result.attendeeGuidance.confidenceScore ?? "n/a"}`,
            result.attendeeGuidance.rationale,
          ]),
        ]
      : [],
    "Attendee routing will appear here.",
  );
  renderNodeList(
    explainability,
    [
      createMetricCard(
        "Optimization confidence",
        [
          `Confidence score: ${result.explainability.confidenceScore}`,
          ...result.explainability.reasons,
          ...result.explainability.assumptions.map((item) => `Assumption: ${item}`),
        ],
        requestId,
      ),
    ],
    "Model reasoning will appear here.",
  );
  const interventionCards = result.interventions.map((item) => {
    const card = createMetricCard(
      `${item.type.toUpperCase()} · ${item.zoneId}`,
      [
        item.message,
        `Confidence: ${item.confidenceScore ?? "n/a"}`,
        item.rationale ?? "No rationale provided.",
      ],
      item.priority,
    );
    card.classList.add(`priority-${item.priority}`);
    return card;
  });
  renderNodeList(interventions, interventionCards, "No interventions yet.", "cards");
  deliveryPreview.textContent = formatJson({ requestId, diagnostics, delivery });
}

async function runOptimization() {
  let snapshot;
  let attendee;
  try {
    snapshot = JSON.parse(snapshotInput.value);
    attendee = attendeeInput.value.trim() ? JSON.parse(attendeeInput.value) : undefined;
  } catch (error) {
    window.alert(`Invalid JSON: ${error instanceof Error ? error.message : "Unknown parsing error"}`);
    return;
  }

  runButton.disabled = true;
  runButton.textContent = "Running...";
  try {
    const { response, data } = await fetchJson("/api/optimize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot, attendee }),
    });
    if (!response.ok) {
      const issueText = Array.isArray(data.issues)
        ? data.issues.map((issue) => `${issue.path || "payload"}: ${issue.message}`).join("\n")
        : data.error ?? "Optimization failed.";
      window.alert(issueText);
      return;
    }
    renderResult(data);
    await loadAudit();
  } finally {
    runButton.disabled = false;
    runButton.textContent = "Run optimization";
  }
}

async function compareScenarios() {
  const baselineScenario = scenarios.demo;
  const candidateKey = scenarioSelect.value;
  const candidateScenario = candidateKey === "demo" ? scenarios.halftime : scenarios[candidateKey];
  const { response, data } = await fetchJson("/api/compare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      baselineSnapshot: baselineScenario ? baselineScenario.snapshot : JSON.parse(snapshotInput.value),
      candidateSnapshot: candidateScenario.snapshot,
      attendee: candidateScenario.attendee,
    }),
  });
  if (!response.ok) {
    window.alert(data.error ?? "Comparison failed.");
    return;
  }
  const delta = data.comparison.delta;
  renderNodeList(
    comparisonOutput,
    [
      createMetricCard("Scenario comparison", [
        `Average pressure delta: ${delta.averagePressureDelta}`,
        `Highest wait delta: ${delta.highestWaitDelta}`,
        `Action count delta: ${delta.actionCountDelta}`,
        `Improved hotspots: ${delta.improvedHotspots.join(", ") || "none"}`,
        `Worsened hotspots: ${delta.worsenedHotspots.join(", ") || "none"}`,
        delta.conclusion,
      ], data.requestId),
    ],
    "Run a comparison to see resilience improvements or regressions.",
  );
  await loadAudit();
}

loadDemoButton.addEventListener("click", () => {
  loadScenario(scenarioSelect.value).catch((error) => {
    window.alert(`Could not load scenario: ${error instanceof Error ? error.message : "Unknown error"}`);
  });
});

scenarioSelect.addEventListener("change", () => {
  loadScenario(scenarioSelect.value).catch((error) => {
    window.alert(`Could not switch scenario: ${error instanceof Error ? error.message : "Unknown error"}`);
  });
});

runButton.addEventListener("click", () => {
  runOptimization().catch((error) => {
    window.alert(`Could not run optimization: ${error instanceof Error ? error.message : "Unknown error"}`);
  });
});

compareButton.addEventListener("click", () => {
  compareScenarios().catch((error) => {
    window.alert(`Could not compare scenarios: ${error instanceof Error ? error.message : "Unknown error"}`);
  });
});

loadConfig().catch(() => {
  integrationMode.textContent = "Could not load integration config";
});
loadAudit().catch(() => {});
loadScenario("demo").catch(() => {});
