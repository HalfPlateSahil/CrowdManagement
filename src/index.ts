import { startServer } from "./server/http.js";

const port = Number(process.env.PORT ?? "3000");
const server = startServer(port);

server.on("listening", () => {
  console.log(`PulsePath dashboard running at http://localhost:${port}`);
});

server.on("error", (error: Error) => {
  console.error(`PulsePath failed: ${error.message}`);
  process.exitCode = 1;
});
