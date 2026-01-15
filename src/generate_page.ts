import fs from "fs";
import https from "https";
import moment from "moment-timezone";
import request from "request";
import tsdav from "tsdav";

import auth from "./auth.json";
import config from "./config.json";

interface Event {
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
      return { datetime: moment.tz(line, "Europe/Stockholm"), fullDay: false };
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
    start: e.start.datetime.clone().tz("Europe/Stockholm"),
    end: e.end.datetime.clone().tz("Europe/Stockholm"),
    isFullDayEntry: e.start.fullDay && e.end.fullDay,
    location: e.location || "",
    isMarked: e.isMarked || false
  };
}


function writeIndex(statuses: Event[]) {
  const SourceFile = "template.html";
  const TargetFile = "index.html";

  const xkcd = JSON.parse(fs.readFileSync("xkcd.json", "utf-8"));

  let template = fs.readFileSync(SourceFile, "utf8");

  if (statuses == null || statuses.length === 0) {
    template = template.replace("%%%STATUS%%%", "¯\\_(ツ)_/¯");
  }
  else {
    const now = moment();

    let status = `<table class="entries">`;
    statuses.forEach(e => {
      const location = e.location;

      let highlight = (now >= e.start && now <= e.end) ? "current" : "other";
      let result = `<tr class="entry" id="${highlight}">`;
      if (e.isFullDayEntry) {
        result += `<td class="time">All-day</td>`;
        result += `<td class="status">${e.status}</td>`;
        result += `<td class="location">${location}</td>`;
        result += `</tr>`;
      }
      else {
        const start = e.start.format("HH:mm");
        const end = e.end.format("HH:mm");
        result += `<td class="time">(${start}&ndash;${end})</td>`;
        result += `<td class="status">${e.status}</td>`;
        result += `<td class="location">${location}</td>`;
        result += `</tr>`;
      }
      status += result;
    });
    status += "</table>";
    template = template.replace("%%%STATUS%%%", status);
  }

  template = template.replace("%%%CONTENT-TEXT%%%", `Random XKCD (#${xkcd.number})`);
  template = template.replace("%%%CONTENT%%%", xkcd.file);

  template = template.replace("%%%MEETING-URL%%%", config["meeting-url"]);
  template = template.replace("%%%FOCUS-URL%%%", config["focus-url"]);

  template = template.replace("%%%INFO-ROOM%%%", config.info.room);
  template = template.replace("%%%INFO-DIVISION%%%", config.info.division);
  template = template.replace("%%%INFO-GROUP%%%", config.info.group);
  template = template.replace("%%%INFO-NAME%%%", config.info.name);
  template = template.replace("%%%INFO-TITLE%%%", config.info.title);

  template = template.replace(
    "%%%TIMESTAMP%%%",
    `Last updated: ${moment().format("YYYY-MM-DD HH:mm:ss")}`
  );
  fs.writeFileSync(`./public/${TargetFile}`, template, "utf8");
}

function downloadXKCD(time: any) {
  const xkcd = JSON.parse(fs.readFileSync("xkcd.json", "utf-8"));

  // If the previous download is more than a day old, download a new file. This download
  // will probably take longer than the other parts of this file, so the first update of
  // the day might still use the old XKCD image, but who cares
  if (time >= moment(xkcd.date).add(1, "day")) {
    console.log(
      `Downloading new XKCD. Now: ${time.format("YYYYMMDD")}, Previous: ${xkcd.date}`
    );
    request(
      "https://c.xkcd.com/random/comic/",
      (error: any, response: any, body: any) => {
        const comicNumber = parseInt(response.request.href.substring("https://xkcd.com/".length).slice(0, -1));
        if (config["xkcd-skip"].includes(comicNumber)) {
          console.log(`Skipping comic ${comicNumber} due to blacklisting`);
        }
        else {
          const res = response.body.replace(/\n/g, "").replace(/\t/g, "");

          const SearchString = `<div id="comic"><img src="`;
          const imgBeg = res.indexOf(SearchString) + SearchString.length;
          const imgEnd = res.indexOf('"', imgBeg);
          const imagePath = `https:${res.substring(imgBeg, imgEnd)}`;
          const ext = imagePath.substring(imagePath.length - 3);

          const targetFile = `./public/xkcd.${ext}`;
          const file = fs.createWriteStream(targetFile);
          https.get(imagePath, res => res.pipe(file)).on('error', e => console.error(e));

          console.log(`Number: ${comicNumber}`, `Image: ${imagePath}`);
          const xkcd = {
              date: moment().utc().format('YYYYMMDD'),
              file: `xkcd.${ext}`,
              number: comicNumber
          }
          fs.writeFileSync("xkcd.json", JSON.stringify(xkcd), "utf8");
        }
      }
    );
  }
}

export async function generate_page(now?: moment.Moment) {
  if (now == undefined)  now = moment();

  let fullPath = `https://${config.hostname}${config.path}`;
  const client = await tsdav.createDAVClient({
    serverUrl: fullPath,
    credentials: {
      username: auth.username,
      password: auth.password
    },
    authMethod: "Basic",
    defaultAccountType: "caldav"
  });


  // Filter by calendars that we are interested in from the config file
  let calendars = await client.fetchCalendars();
  calendars = calendars.filter(function(c) {
    let name = c.url.substring(fullPath.length);
    name = name.substring(0, name.length - 1); // remove terminating /
    return config.calendars.includes(name);
  });

  let ba = 'Basic ' + Buffer.from(auth.username + ':' + auth.password).toString('base64');
  let results: Event[] = [];
  for (let calendar of calendars) {
    const today = now.utc().format("YYYY-MM-DD");
    let objects = await tsdav.fetchCalendarObjects({
      calendar: calendar,
      headers: {
        authorization: ba
      },
      timeRange: {
        start: `${today}T00:00:00`,
        end: `${today}T24:00:00`
      }
    })

    for (let obj of objects) {
      let result = parseCalendarEntry(obj.data);
      results.push(result);
    }
  }

  results = results.filter((e) => e && e.isMarked);
  results = results.sort((a,b) => +a.start - +b.start);

  downloadXKCD(now);
  writeIndex(results);
}
