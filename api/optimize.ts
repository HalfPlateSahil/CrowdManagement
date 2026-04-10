import type { VercelRequest, VercelResponse } from "@vercel/node";

import { createAppContext, runOptimizationPayload } from "../src/server/app.js";

const context = createAppContext();

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  try {
    const result = await runOptimizationPayload(context, request.body ?? {});
    response.status(result.statusCode).json(result.body);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    response.status(500).json({ error: message });
  }
}
