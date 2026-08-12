import crypto from "node:crypto";
import path from "node:path";
import basicAuth from "express-basic-auth";
import cors from "cors";
import express from "express";

import { auth, config, RootDir } from "./config";
import { getFlags, getStatus, setFlags } from "./state";
import { ImageDir } from "./xkcd";

const ClientDir = path.join(RootDir, "client", "dist");

// Compares the digests rather than the raw values so that neither the content nor the
// length of the secret leaks through the comparison time
function isEqual(lhs: string, rhs: string): boolean {
  const a = crypto.createHash("sha256").update(lhs).digest();
  const b = crypto.createHash("sha256").update(rhs).digest();
  return crypto.timingSafeEqual(a, b);
}

function requireToken(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.substring("Bearer ".length) : "";
  if (!isEqual(token, auth.webpassword)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

const pageAuth = basicAuth({
  authorizer: (user: string, password: string) => {
    return isEqual(user, "office") && isEqual(password, auth.webpassword);
  },
  challenge: true,
  realm: "Officespace"
});

export function startServer() {
  const app = express();
  app.use(cors({ origin: "*" }));
  app.use(express.json());

  app.post("/api/flags", requireToken, (req, res) => {
    const body = req.body as Partial<Record<"meeting" | "focus", unknown>>;
    const update: Partial<{ meeting: boolean, focus: boolean }> = {};
    if (typeof body.meeting == "boolean")  update.meeting = body.meeting;
    if (typeof body.focus == "boolean")  update.focus = body.focus;
    setFlags(update);
    res.json(getFlags());
  });

  app.use(pageAuth);

  app.get("/api/flags", (_req, res) => {
    res.json(getFlags());
  });

  app.get("/api/status", (_req, res) => {
    const status = getStatus();
    if (status == null) {
      res.status(503).json({ error: "No status has been generated yet" });
      return;
    }
    res.json(status);
  });

  app.use("/xkcd", express.static(ImageDir));
  app.use(express.static(ClientDir));

  // Single page application fallback
  app.use((_req, res) => {
    res.sendFile(path.join(ClientDir, "index.html"));
  });

  app.listen(config.hostingPort, () => {
    console.log(`Listening on http://localhost:${config.hostingPort}`);
  });
}
