import moment from "moment-timezone";
import { fetchCalendarObjects, fetchCalendars } from "tsdav";

import { auth, config } from "./config";

export const Timezone = "Europe/Stockholm";

export interface Event {
  start: moment.Moment;
  end: moment.Moment;
  status: string;
  location: string;
  isMarked: boolean;
  isFullDayEntry: boolean;
}

// Given a CalDAV entry, it returns the starting time, ending time, and the summary of the
// entry
function parseCalendarEntry(text: string): Event {
  interface Time {
    datetime: moment.Moment,
    fullDay: boolean;
  };
  interface EventStub {
    start?: Time;
    end?: Time;
    status?: string;
    location?: string;
    isMarked?: boolean;
    isAnonymous?: boolean;
    modified?: moment.Moment;
  };

  function parseTimeLine(line: string) {
    let timeTZ = "UTC";
    let isFullDay = false;
    if (line.startsWith("TZID")) {
      // If we have a regular entry, the first value is the timezone identifier
      timeTZ = line.substring("TZID=".length, line.indexOf(":"));
    }
    else if (line.startsWith("VALUE")) {
      // We have a full day entry, so there is no timezone identifier (at least in the
      // ones created in Fantastical)
      isFullDay = true;
    }
    else if (line.endsWith("Z")) {
      return { datetime: moment.tz(line, Timezone), fullDay: false };
    }
    else {
      console.error(line.substring(0, "TZID".length));
      console.error("ERROR parsing date for data: ", line);
    }
    // Get the date, but then remove the day component as that might be different
    let time = line.substring(line.indexOf(":") + 1).substring("YYYYMMDD".length);
    // Attach the day component of today to the hhmmss of the event
    const timeMoment = moment.tz(moment().utc().format("YYYYMMDD") + time, timeTZ);
    return {
      datetime: timeMoment,
      fullDay: isFullDay
    };
  }

  const lines = text.split("\n");

  let events: EventStub[] = [];
  let event: EventStub | null = null;
  for (let line of lines) {
    // Remove trailing \n and \r
    line = line.trim();

    if (event == null) {
      if (line == "BEGIN:VEVENT")  event = {};
      continue;
    }

    if (line == "END:VEVENT") {
      events.push(event);
      event = null;
      continue;
    }

    if (line.startsWith("DTSTART:") || line.startsWith("DTSTART;")) {
      event.start = parseTimeLine(line.substring("DTSTART:".length));
    }

    if (line.startsWith("DTEND:") || line.startsWith("DTEND;")) {
      event.end = parseTimeLine(line.substring("DTEND:".length));
    }

    if (line.startsWith("SUMMARY:")) {
      event.status = line.substring("SUMMARY:".length);
    }

    if (line.startsWith("LOCATION:")) {
      event.location = line.substring("LOCATION:".length);
    }

    if (line.startsWith("DESCRIPTION:")) {
      let description = line.substring("DESCRIPTION".length);
      event.isMarked = description.toLowerCase().includes("#status");
      event.isAnonymous = description.toLowerCase().includes("#anon");
    }

    if (line.startsWith("LAST-MODIFIED:")) {
      event.modified = moment.tz(line.substring("LAST-MODIFIED:".length), "UTC");
    }
  }

  // There might be many events for the same *actual* event, they are in random order but
  // do have a modified date. So we can sort by the modified date and just take the first
  // one and discard the rest
  events.sort((lhs, rhs) => +rhs.modified! - +lhs.modified!);

  let e = events[0];
  if (e == undefined || e.start == undefined || e.end == undefined ||
      e.status == undefined || e.modified == undefined)
  {
    console.error(lines);
    console.error(event);
    throw "Error parsing event";
  }

  if (e.isAnonymous) {
    e.status = "Busy";
    e.location = "";
  }

  return {
    status: e.status || "",
    start: e.start.datetime.clone().tz(Timezone),
    end: e.end.datetime.clone().tz(Timezone),
    isFullDayEntry: e.start.fullDay && e.end.fullDay,
    location: e.location || "",
    isMarked: e.isMarked || false
  };
}

export async function fetchEvents(now: moment.Moment): Promise<Event[]> {
  const rootUrl = `https://${config.hostname}`;
  const fullPath = `${rootUrl}${config.path}`;
  const ba = "Basic " + Buffer.from(`${auth.username}:${auth.password}`).toString("base64");

  // The configured path already is the calendar home, so we skip the principal/home
  // discovery that createDAVClient would do as not all servers support it there
  let calendars = await fetchCalendars({
    account: {
      accountType: "caldav",
      serverUrl: fullPath,
      rootUrl: rootUrl,
      homeUrl: fullPath
    },
    headers: {
      authorization: ba
    }
  });

  // Filter by calendars that we are interested in from the config file
  calendars = calendars.filter(function(c) {
    let name = c.url.substring(fullPath.length);
    name = name.substring(0, name.length - 1); // remove terminating /
    return config.calendars.includes(name);
  });

  let results: Event[] = [];
  for (const calendar of calendars) {
    const today = now.utc().format("YYYY-MM-DD");
    const objects = await fetchCalendarObjects({
      calendar: calendar,
      headers: {
        authorization: ba
      },
      timeRange: {
        start: `${today}T00:00:00`,
        end: `${today}T24:00:00`
      }
    });

    for (const obj of objects) {
      results.push(parseCalendarEntry(obj.data));
    }
  }

  results = results.filter((e) => e && e.isMarked);
  results = results.sort((a, b) => +a.start - +b.start);
  return results;
}
