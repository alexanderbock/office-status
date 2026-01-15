import basicAuth from "express-basic-auth";
import bodyParser from "body-parser";
import cors from "cors";
import express from "express";

import auth from "./auth.json";
import config from "./config.json";

const baOffice = basicAuth({
  users: { "office": auth.webpassword },
  challenge: true,
  realm: "Officespace"
});

// State
let in_meeting = false;
let in_focus = false;

export function setup(app: express.Express) {

}

function setMeeting(req: express.Request, res: express.Response) {
  if (req.query["auth"] != auth.webpassword) {
    res.status(404);
  }
  else {
    in_meeting = true;
    res.status(200);
  }
  res.end();
}

function resetMeeting(req: express.Request, res: express.Response) {
  if (req.query["auth"] != auth.webpassword) {
    res.status(404);
  }
  else {
    in_meeting = false;
    res.status(200);
  }
  res.end();
}

function inMeeting(req: express.Request, res: express.Response) {
  res.setHeader("Content-Type", "text/plain");
  res.send(JSON.stringify({ status: in_meeting }));
  res.status(200);
  res.end();
}

function setFocus(req: express.Request, res: express.Response) {
  if (req.query["auth"] != auth.webpassword) {
    res.status(404);
  }
  else {
    in_focus = true;
    res.status(200);
  }
  res.end();
}

function resetFocus(req: express.Request, res: express.Response) {
  if (req.query["auth"] != auth.webpassword) {
    res.status(404);
  }
  else {
    in_focus = false;
    res.status(200);
  }
  res.end();
}

function inFocus(req: express.Request, res: express.Response) {
  res.setHeader("Content-Type", "text/plain");
  res.send(JSON.stringify({ status: in_focus }));
  res.status(200);
  res.end();
}

export function setup_hosting() {
  const app = express();
  app.use(cors({ origin: "*" }));
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());

  app.get("/office-status/set-meeting", setMeeting);
  app.get("/office-status/reset-meeting", resetMeeting);
  app.get("/office-status/in-meeting", inMeeting);

  app.get("/office-status/set-focus", setFocus);
  app.get("/office-status/reset-focus", resetFocus);
  app.get("/office-status/in-focus", inFocus);

  app.use("/office-status", baOffice, express.static("public"));

  app.listen(config.hostingPort);
}
