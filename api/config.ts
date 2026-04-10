import type { VercelRequest, VercelResponse } from "@vercel/node";

import { createAppContext, getConfigPayload } from "../src/server/app.js";

const context = createAppContext();

export default function handler(_request: VercelRequest, response: VercelResponse): void {
  response.status(200).json(getConfigPayload(context));
}
