import fs from "node:fs";
import moment from "moment-timezone";

import { startServer } from "./api";
import { Event, fetchEvents, Timezone } from "./caldav";
import { config, DataDir } from "./config";
import { setStatus, Status, StatusEntry } from "./state";
import { currentXkcd, updateXkcd } from "./xkcd";

const UpdateInterval = 5 * 60 * 1000;

function toEntry(event: Event, now: moment.Moment): StatusEntry {
  return {
    allDay: event.isFullDayEntry,
    startLabel: event.start.format("HH:mm"),
    endLabel: event.end.format("HH:mm"),
    status: event.status,
    location: event.location,
    isCurrent: now >= event.start && now <= event.end,
    // Full day entries carry no meaningful time, so they never count as finished
    isPast: !event.isFullDayEntry && now > event.end
  };
}

async function refresh(now: moment.Moment = moment()) {
  const events = await fetchEvents(now);
  await updateXkcd(now);

  const xkcd = currentXkcd();
  const status: Status = {
    info: config.info,
    entries: events.map((e) => toEntry(e, now)),
    xkcd: { number: xkcd.number, file: xkcd.file },
    updatedAt: now.clone().tz(Timezone).format("YYYY-MM-DD HH:mm:ss")
  };
  setStatus(status);
}

async function update(now?: moment.Moment) {
  try {
    await refresh(now);
  }
  catch (e) {
    console.error("Failed to update the status:", e);
  }
}

async function main() {
  fs.mkdirSync(DataDir, { recursive: true });

  // An argument is interpreted as the date to generate a one-off status for
  const date = process.argv[2];
  if (date != undefined) {
    await update(moment(date));
  }
  else {
    await update();
    setInterval(update, UpdateInterval);
  }

  startServer();
}

main();
