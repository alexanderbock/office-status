import moment from "moment-timezone";
import { RRule, RRuleSet } from "rrule";
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

interface Time {
  datetime: moment.Moment;
  fullDay: boolean;
}

// A single VEVENT. One calendar object can hold several of them: the master entry of a
// recurring event plus one entry for every occurrence that was edited individually. Those
// carry a RECURRENCE-ID naming the occurrence that they replace
interface Component {
  uid: string;
  start: Time;
  end: Time;
  status: string;
  location: string;
  isMarked: boolean;
  isAnonymous: boolean;
  modified: moment.Moment;
  rrule: string | null;
  exdates: moment.Moment[];
  recurrenceId: moment.Moment | null;
}

// The rrule library has no notion of timezones, so all recurrence math is done on
// wall-clock times that are pushed into UTC and pulled back out again afterwards
function toFloating(time: moment.Moment): Date {
  const t = time.clone().tz(Timezone);
  return new Date(Date.UTC(
    t.year(), t.month(), t.date(), t.hour(), t.minute(), t.second()
  ));
}

function fromFloating(date: Date): moment.Moment {
  return moment.tz({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds()
  }, Timezone);
}

// Undoes the line folding that iCalendar applies to long values, where a continuation is
// marked by a leading space or tab
function unfold(text: string): string[] {
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    const l = line.replace(/\r$/, "");
    if ((l.startsWith(" ") || l.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += l.substring(1);
    }
    else {
      lines.push(l);
    }
  }
  return lines;
}

// Splits a content line into its property name, its parameters, and its value. The
// parameters always sit in front of the first colon, so that colon ends the name
function splitLine(line: string) {
  const idx = line.indexOf(":");
  if (idx == -1)  return null;

  const parts = line.substring(0, idx).split(";");
  return {
    name: (parts[0] ?? "").toUpperCase(),
    params: parts.slice(1),
    value: line.substring(idx + 1)
  };
}

function parseTime(params: string[], value: string): Time {
  const tzid = params.find((p) => p.startsWith("TZID="))?.substring("TZID=".length);

  if (params.includes("VALUE=DATE")) {
    // A full day entry has no time and no timezone identifier attached to it (at least in
    // the ones created in Fantastical)
    return { datetime: moment.tz(value, "YYYYMMDD", tzid ?? Timezone), fullDay: true };
  }
  if (value.endsWith("Z")) {
    return { datetime: moment.tz(value, "YYYYMMDDTHHmmss[Z]", "UTC"), fullDay: false };
  }
  return {
    datetime: moment.tz(value, "YYYYMMDDTHHmmss", tzid ?? Timezone),
    fullDay: false
  };
}

// Extracts all VEVENTs of a calendar object. An entry that is too broken to be placed on a
// timeline is dropped rather than failing the whole update
function parseCalendarObject(text: string): Component[] {
  interface Stub {
    uid?: string;
    start?: Time;
    end?: Time;
    status?: string;
    location?: string;
    isMarked?: boolean;
    isAnonymous?: boolean;
    modified?: moment.Moment;
    rrule?: string;
    exdates: moment.Moment[];
    recurrenceId?: moment.Moment;
  }

  const components: Component[] = [];
  let stub: Stub | null = null;

  for (const line of unfold(text)) {
    if (line.trim() == "BEGIN:VEVENT") {
      stub = { exdates: [] };
      continue;
    }
    if (stub == null)  continue;

    if (line.trim() == "END:VEVENT") {
      const s = stub;
      stub = null;

      if (s.uid == undefined || s.start == undefined) {
        console.error("ERROR parsing event, missing UID or DTSTART: ", s);
        continue;
      }

      // A single full day entry may omit DTEND, in which case it covers exactly one day
      const end = s.end ??
        (s.start.fullDay ?
          { datetime: s.start.datetime.clone().add(1, "day"), fullDay: true } :
          s.start);

      components.push({
        uid: s.uid,
        start: s.start,
        end: end,
        status: s.status ?? "",
        location: s.location ?? "",
        isMarked: s.isMarked ?? false,
        isAnonymous: s.isAnonymous ?? false,
        modified: s.modified ?? moment.tz(0, "UTC"),
        rrule: s.rrule ?? null,
        exdates: s.exdates,
        recurrenceId: s.recurrenceId ?? null
      });
      continue;
    }

    const p = splitLine(line);
    if (p == null)  continue;

    switch (p.name) {
      case "UID":
        stub.uid = p.value;
        break;
      case "DTSTART":
        stub.start = parseTime(p.params, p.value);
        break;
      case "DTEND":
        stub.end = parseTime(p.params, p.value);
        break;
      case "RECURRENCE-ID":
        stub.recurrenceId = parseTime(p.params, p.value).datetime;
        break;
      case "RRULE":
        stub.rrule = p.value;
        break;
      case "EXDATE":
        // A single EXDATE line can carry a comma-separated list of dates
        for (const v of p.value.split(",")) {
          stub.exdates.push(parseTime(p.params, v).datetime);
        }
        break;
      case "SUMMARY":
        stub.status = p.value;
        break;
      case "LOCATION":
        stub.location = p.value;
        break;
      case "DESCRIPTION":
        stub.isMarked = p.value.toLowerCase().includes("#status");
        stub.isAnonymous = p.value.toLowerCase().includes("#anon");
        break;
      case "LAST-MODIFIED":
        stub.modified = moment.tz(p.value, "YYYYMMDDTHHmmss[Z]", "UTC");
        break;
    }
  }

  return components;
}

function toEvent(c: Component, start: moment.Moment, end: moment.Moment): Event {
  return {
    status: c.isAnonymous ? "Busy" : c.status,
    location: c.isAnonymous ? "" : c.location,
    start: start.clone().tz(Timezone),
    end: end.clone().tz(Timezone),
    isFullDayEntry: c.start.fullDay && c.end.fullDay,
    isMarked: c.isMarked
  };
}

function overlaps(start: moment.Moment, end: moment.Moment, dayStart: moment.Moment,
                  dayEnd: moment.Moment): boolean
{
  return start.isBefore(dayEnd) && end.isAfter(dayStart);
}

// Turns the VEVENTs of a calendar object into the events that actually take place between
// dayStart and dayEnd
function expand(components: Component[], dayStart: moment.Moment,
                dayEnd: moment.Moment): Event[]
{
  const byUid = new Map<string, Component[]>();
  for (const c of components) {
    byUid.set(c.uid, [...(byUid.get(c.uid) ?? []), c]);
  }

  const events: Event[] = [];
  for (const group of byUid.values()) {
    // The same VEVENT can be delivered more than once and in random order, but it does
    // have a modified date, so we keep the newest copy of each of them
    const newest = new Map<string, Component>();
    for (const c of group) {
      const key = c.recurrenceId?.toISOString() ?? "";
      const previous = newest.get(key);
      if (previous == undefined || +c.modified > +previous.modified) {
        newest.set(key, c);
      }
    }

    const master = newest.get("") ?? null;
    const overrides = [...newest.values()].filter((c) => c.recurrenceId != null);

    for (const o of overrides) {
      if (overlaps(o.start.datetime, o.end.datetime, dayStart, dayEnd)) {
        events.push(toEvent(o, o.start.datetime, o.end.datetime));
      }
    }

    if (master == null)  continue;

    if (master.rrule == null) {
      if (overlaps(master.start.datetime, master.end.datetime, dayStart, dayEnd)) {
        events.push(toEvent(master, master.start.datetime, master.end.datetime));
      }
      continue;
    }

    const options = RRule.parseString(master.rrule);
    options.dtstart = toFloating(master.start.datetime);
    if (options.until != undefined) {
      // UNTIL is given in UTC, the rest of the rule runs on wall-clock time
      options.until = toFloating(moment(options.until));
    }

    const set = new RRuleSet();
    set.rrule(new RRule(options));
    // Deleted occurrences, plus the occurrences that were replaced by an edited copy. The
    // latter is what keeps an event that was moved to another day from also showing up on
    // the day that it used to be on
    const removed = master.exdates.concat(overrides.map((o) => o.recurrenceId!));
    for (const r of removed) {
      set.exdate(toFloating(r));
    }

    const duration = +master.end.datetime - +master.start.datetime;
    for (const occurrence of set.between(toFloating(dayStart), toFloating(dayEnd), true)) {
      const start = fromFloating(occurrence);
      // between() includes both of its bounds, but the end of the day already belongs to
      // the next one
      if (!start.isBefore(dayEnd))  continue;

      events.push(toEvent(master, start, start.clone().add(duration, "ms")));
    }
  }

  return events;
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

  // The day that we are showing is the local one, which is not the same as the UTC day
  const dayStart = now.clone().tz(Timezone).startOf("day");
  const dayEnd = dayStart.clone().add(1, "day");

  let results: Event[] = [];
  for (const calendar of calendars) {
    const objects = await fetchCalendarObjects({
      calendar: calendar,
      headers: {
        authorization: ba
      },
      timeRange: {
        start: dayStart.clone().utc().format("YYYY-MM-DDTHH:mm:ss[Z]"),
        end: dayEnd.clone().utc().format("YYYY-MM-DDTHH:mm:ss[Z]")
      }
    });

    for (const obj of objects) {
      results = results.concat(expand(parseCalendarObject(obj.data), dayStart, dayEnd));
    }
  }

  results = results.filter((e) => e && e.isMarked);
  results = results.sort((a, b) => +a.start - +b.start);
  return results;
}
