const snapshotInput = document.querySelector("#snapshot-input");
const attendeeInput = document.querySelector("#attendee-input");
const zonePressure = document.querySelector("#zone-pressure");
const queueRecommendations = document.querySelector("#queue-recommendations");
const attendeeGuidance = document.querySelector("#attendee-guidance");
const interventions = document.querySelector("#interventions");
const deliveryPreview = document.querySelector("#delivery-preview");
const integrationMode = document.querySelector("#integration-mode");
const loadDemoButton = document.querySelector("#load-demo");
const runButton = document.querySelector("#run-optimization");

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function pressureTone(value) {
  if (value >= 1.05) return "Critical";
  if (value >= 0.9) return "High";
  if (value >= 0.7) return "Elevated";
  return "Healthy";
}

function renderMetrics(container, items, emptyText) {
  if (!items.length) {
    container.className = "metric-list empty";
    container.textContent = emptyText;
    return;
  }

  container.className = "metric-list";
  container.innerHTML = items.join("");
}

function renderCards(container, items, emptyText) {
  if (!items.length) {
    container.className = "cards empty";
    container.textContent = emptyText;
    return;
  }

  container.className = "cards";
  container.innerHTML = items.join("");
}

async function loadDemo() {
  const response = await fetch("/api/demo");
  const data = await response.json();
  snapshotInput.value = formatJson(data.snapshot);
  attendeeInput.value = formatJson(data.attendee);
}

async function loadConfig() {
  const response = await fetch("/api/config");
  const data = await response.json();
  const diagnostics = data.diagnostics;
  const integrations = diagnostics.integrations;

  integrationMode.textContent =
    diagnostics.mode === "live"
      ? `Live Google mode · ${diagnostics.projectId ?? "project configured"}`
      : `Demo mode · Maps ${integrations.maps}, Firebase ${integrations.notifications}, Pub/Sub ${integrations.pubsub}`;
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

  const response = await fetch("/api/optimize", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ snapshot, attendee }),
  });

  const data = await response.json();

  if (!response.ok) {
    window.alert(data.error ?? "Optimization failed.");
    return;
  }

  const result = data.result;
  renderMetrics(
    zonePressure,
    Object.entries(result.zonePressure).map(
      ([zoneId, pressure]) => `
        <div class="metric">
          <strong>${zoneId}</strong>
          <div>Pressure score: ${pressure}</div>
          <span class="pill">${pressureTone(Number(pressure))}</span>
        </div>`,
    ),
    "Run a scenario to see zone pressure.",
  );

  renderMetrics(
    queueRecommendations,
    result.queueRecommendations.map(
      (item) => `
        <div class="metric">
          <strong>${item.servicePointId}</strong>
          <div>Estimated wait: ${item.estimatedWaitMinutes} minutes</div>
          <div>Alternative: ${item.recommendedAlternativeId ?? "No better alternative nearby"}</div>
        </div>`,
    ),
    "Queue guidance will appear here.",
  );

  renderMetrics(
    attendeeGuidance,
    result.attendeeGuidance
      ? [
          `<div class="metric">
            <strong>${result.attendeeGuidance.attendeeId}</strong>
            <div>Path: ${result.attendeeGuidance.route.path.join(" -> ")}</div>
            <div>Walk time: ${result.attendeeGuidance.route.estimatedMinutes} minutes</div>
            <div>${result.attendeeGuidance.rationale}</div>
          </div>`,
        ]
      : [],
    "Attendee routing will appear here.",
  );

  renderCards(
    interventions,
    result.interventions.map(
      (item) => `
        <div class="metric priority-${item.priority}">
          <strong>${item.type.toUpperCase()} · ${item.zoneId}</strong>
          <div>${item.message}</div>
          <span class="pill">${item.priority}</span>
        </div>`,
    ),
    "No interventions yet.",
  );

  deliveryPreview.textContent = formatJson(data.delivery);
}

loadDemoButton.addEventListener("click", () => {
  loadDemo().catch((error) => {
    window.alert(`Could not load demo data: ${error instanceof Error ? error.message : "Unknown error"}`);
  });
});

runButton.addEventListener("click", () => {
  runOptimization().catch((error) => {
    window.alert(`Could not run optimization: ${error instanceof Error ? error.message : "Unknown error"}`);
  });
});

loadConfig().catch(() => {
  integrationMode.textContent = "Could not load integration config";
});

loadDemo().catch(() => {});
