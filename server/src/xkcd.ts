import fs from "node:fs";
import path from "node:path";
import moment from "moment-timezone";

import { config, DataDir } from "./config";

export const ImageDir = path.join(DataDir, "images");

const StateFile = path.join(DataDir, "xkcd.json");
const InitialState: XkcdState = { date: "19000101", file: "", number: -1 };

export interface XkcdState {
  date: string;
  file: string;
  number: number;
}

export function currentXkcd(): XkcdState {
  if (!fs.existsSync(StateFile))  return InitialState;
  return JSON.parse(fs.readFileSync(StateFile, "utf8")) as XkcdState;
}

// Downloads a new comic if the previous one is more than a day old. Failures are logged
// and swallowed so that a broken comic can never take down the status board
export async function updateXkcd(now: moment.Moment): Promise<void> {
  const state = currentXkcd();
  if (now < moment(state.date, "YYYYMMDD").add(1, "day"))  return;

  console.log(
    `Downloading new XKCD. Now: ${now.format("YYYYMMDD")}, Previous: ${state.date}`
  );

  try {
    const response = await fetch("https://c.xkcd.com/random/comic/");
    if (!response.ok) {
      throw new Error(`Requesting a random comic failed with ${response.status}`);
    }

    const number = parseInt(new URL(response.url).pathname.replaceAll("/", ""), 10);
    if (config["xkcd-skip"].includes(number)) {
      console.log(`Skipping comic ${number} due to blacklisting`);
      return;
    }

    const body = (await response.text()).replace(/[\n\t]/g, "");
    const SearchString = `<div id="comic"><img src="`;
    const begin = body.indexOf(SearchString);
    if (begin == -1)  throw new Error(`Could not find an image in comic ${number}`);

    const imgBeg = begin + SearchString.length;
    const imgEnd = body.indexOf(`"`, imgBeg);
    const imagePath = `https:${body.substring(imgBeg, imgEnd)}`;
    const ext = imagePath.substring(imagePath.length - 3);

    const image = await fetch(imagePath);
    if (!image.ok) {
      throw new Error(`Downloading ${imagePath} failed with ${image.status}`);
    }

    console.log(`Number: ${number}`, `Image: ${imagePath}`);

    const file = `xkcd.${ext}`;
    fs.mkdirSync(ImageDir, { recursive: true });
    fs.writeFileSync(
      path.join(ImageDir, file),
      Buffer.from(await image.arrayBuffer())
    );
    fs.writeFileSync(
      StateFile,
      JSON.stringify({ date: now.utc().format("YYYYMMDD"), file: file, number: number }),
      "utf8"
    );
  }
  catch (e) {
    console.error("Failed to update the XKCD comic:", e);
  }
}
