import fs from "node:fs";
import path from "node:path";

export interface Config {
  hostingPort: number;
  hostname: string;
  path: string;
  calendars: string[];
  "xkcd-skip": number[];
  info: {
    room: string;
    division: string;
    group: string;
    name: string;
    title: string;
  };
}

export interface Auth {
  username: string;
  password: string;
  webpassword: string;
}

export const RootDir = path.resolve(__dirname, "..", "..");
export const DataDir = path.resolve(__dirname, "..", "data");

function load<T>(name: string): T {
  const file = path.join(RootDir, name);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${name}. Copy ${name.replace(".json", "-template.json")} and fill it in`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export const config = load<Config>("config.json");
export const auth = load<Auth>("auth.json");
