import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import {
  MAX_REQUEST_BYTES,
  createAppContext,
  getConfigPayload,
  getDemoPayload,
  resolveStaticAsset,
  runOptimizationPayload,
} from "./app.js";

function send(response: ServerResponse, statusCode: number, body: Buffer | string, contentType: string): void {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  send(response, statusCode, JSON.stringify(payload), "application/json; charset=utf-8");
}

async function parseJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bufferChunk.length;

    if (size > MAX_REQUEST_BYTES) {
      throw new Error("Request body too large.");
    }

    chunks.push(bufferChunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

export function startServer(port = Number(process.env.PORT ?? "3000")) {
  const context = createAppContext();

  const server = createServer(async (request, response) => {
    if (!request.url || !request.method) {
      sendJson(response, 400, { error: "Invalid request." });
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true, timestampIso: new Date().toISOString() });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/demo") {
        sendJson(response, 200, getDemoPayload());
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/config") {
        sendJson(response, 200, getConfigPayload(context));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/optimize") {
        const payload = await parseJsonBody<{ snapshot?: unknown; attendee?: unknown }>(request);
        const result = await runOptimizationPayload(context, payload);
        sendJson(response, result.statusCode, result.body);
        return;
      }

      if (request.method === "GET") {
        const asset = await resolveStaticAsset(url.pathname);
        send(response, asset.statusCode, asset.body, asset.contentType);
        return;
      }

      sendJson(response, 405, { error: "Method not allowed." });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unexpected error.";
      sendJson(response, 500, { error: message });
    }
  });

  server.listen(port);
  return server;
}
