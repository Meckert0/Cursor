import type { IncomingMessage, ServerResponse } from "node:http";
import { waitUntil } from "@vercel/functions";
import { getApp } from "../src/create-app.js";

export const config = {
  maxDuration: 300
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const { app } = await getApp({
    runLocalStartupTasks: false,
    scheduleBackground: (start) => {
      waitUntil(start());
    }
  });
  app.server.emit("request", req, res);
}
