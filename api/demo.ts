import type { VercelRequest, VercelResponse } from "@vercel/node";

import { getDemoPayload } from "../src/server/app.js";

export default function handler(_request: VercelRequest, response: VercelResponse): void {
  response.status(200).json(getDemoPayload());
}
