import fs from "fs";
import https from "https";
import moment from "moment-timezone";
import request from "request";
import tsdav from "tsdav";

import auth from "./auth.json";
import config from "./config.json";
import xkcd from "./xkcd.json";

const TargetPath = config["target-path"];

interface Time {
  datetime: moment.Moment,
  fullDay: Boolean;
};

interface Event {
  start?: Time;
  startTime?: moment.Moment;
  end?: Time;
  endTime?: moment.Moment;
  status?: string;
  location?: string;
  marked?: boolean;
  modified?: moment.Moment;
  isFullDayEntry?: Boolean;
  ordering?: "current" | "other";
}

// Given a CalDAV entry, it returns the starting time, ending time, and the summary of the
// entry
function parseCalendarEntry(text: any): Event {
  function parseTimeLine(line: string) {
    let timeTZ = "UTC";
    let isFullDay = false;
    if (line.startsWith("TZID")) {
      // If we have a regular entry, the first value is going to be the timezone identifier
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

  let events: Event[] = [];
  let event: Event = {};
  let inEvent = false;
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];
    line = line.trim();
    if (!inEvent) {
      if (line == "BEGIN:VEVENT")  inEvent = true;
      continue;
    }

    if (line == "END:VEVENT") {
      events.push(event);
      event = {};
      inEvent = false;
      continue;
    }

    if (line.startsWith("DTSTART:") || line.startsWith("DTSTART;")) {
      event.start = parseTimeLine(line.substr("DTSTART:".length));
    }

    if (line.startsWith("DTEND:") || line.startsWith("DTEND;")) {
      event.end = parseTimeLine(line.substr("DTEND:".length));
    }

    if (line.startsWith("SUMMARY:")) {
      event.status = line.substring("SUMMARY:".length);
    }

    if (line.startsWith("LOCATION:")) {
      event.location = line.substr("LOCATION:".length);
    }

    if (line.startsWith("DESCRIPTION:")) {
      let desc = line.substr("DESCRIPTION".length);
      let desc_lower = desc.toLowerCase();
      event.marked = desc_lower.includes("#status");
    }

    if (line.startsWith("LAST-MODIFIED:")) {
      event.modified = moment.tz(line.substring("LAST-MODIFIED:".length), "UTC");
    }
  }

  // There might be many events for the same *actual* event, they are in random order but
  // do have a modified date. So we can sort by the modified date and just take the first
  // one and discard the rest
  events.sort(function (lhs, rhs) {
    if (lhs.modified == null || rhs.modified == null)  throw "@TMP Error";
    return +rhs.modified - +lhs.modified
  });

  let e = events[0];
  if (e == undefined)  throw "@TMP Error2";
  if (e.start == undefined || e.end == undefined)  throw "@TMP Error3";

  let ordering: "current" | "other";
  const now = moment();
  if (now >= e.start.datetime && now <= e.end.datetime) {
    ordering = "current";
  }
  else {
    ordering = "other";
  }

  return {
    status: e.status || "",
    startTime: e.start.datetime.clone().tz("Europe/Stockholm"),
    endTime: e.end.datetime.clone().tz("Europe/Stockholm"),
    isFullDayEntry: e.start.fullDay && e.end.fullDay,
    ordering: ordering,
    location: e.location || "",
    marked: e.marked || false
  };
}


function writeIndex(statuses: Event[]) {
  const SourceFile = "template.html";
  const TargetFile = "index.html";

  let template = fs.readFileSync(SourceFile, "utf8");

  if (statuses == null || statuses.length === 0) {
    template = template.replace("%%%STATUS%%%", "¯\\_(ツ)_/¯");
  }
  else {
    let status = `<table class="entries">`;
    statuses.forEach(e => {
      if (e.startTime == undefined || e.endTime == undefined)  throw "@TMP Error 3";

      const location = e.location || "";

      let result = `<tr class="entry" id="${e.ordering}">`;
      const start = e.startTime.format("HH:mm");
      const end = e.endTime.format("HH:mm");
      if (e.isFullDayEntry) {
        result += `<td class="time">All-day</td>`;
        result += `<td class="status">${e.status}</td>`;
        result += `<td class="location">${location}</td>`;
        result += `</tr>`;
        status += result;
      }
      else {
        result += `<td class="time">(${start}&ndash;${end})</td>`;
        result += `<td class="status">${e.status}</td>`;
        result += `<td class="location">${location}</td>`;
        result += `</tr>`;
        status += result;
      }
    });
    status += "</table>";
    template = template.replace("%%%STATUS%%%", status);
  }

  template = template.replace("%%%CONTENT-TEXT%%%", `Random XKCD (#${xkcd.number})`);
  template = template.replace("%%%CONTENT%%%", xkcd.file);

  template = template.replace("%%%TIMESTAMP%%%", `Last updated: ${moment().format("YYYY-MM-DD HH:mm:ss")}`);
  fs.writeFileSync(TargetFile, template, "utf8");

  if (fs.existsSync(`${TargetPath}/${TargetFile}`)) {
    fs.unlinkSync(`${TargetPath}/${TargetFile}`);
  }
  fs.renameSync(TargetFile, `${TargetPath}/${TargetFile}`);
}

function downloadXKCD(time: any) {
  // If the previous download is more than a day old, download a new file. This download will
  // probably take longer than the other parts of this file, so the first update of the day
  // might still use the old XKCD image, but who cares
  if (time >= moment(xkcd.date).add(1, "day")) {
      console.log(`Downloading new XKCD. Now: ${time.format("YYYYMMDD")}, Previous: ${xkcd.date}`);
      request("https://c.xkcd.com/random/comic/", (error: any, response: any, body: any) => {
        const comicNumber = parseInt(response.request.href.substring("https://xkcd.com/".length).slice(0, -1));
        if (config["xkcd-skip"].includes(comicNumber)) {
          console.log(`Skipping comic ${comicNumber} due to blacklisting`);
        }
        else {
          // const imageText = `Random XKCD (#${comicNumber})`;
          const res = response.body.replace(/\n/g, "").replace(/\t/g, "");

          const SearchString = `<div id="comic"><img src="`;
          const imgBeg = res.indexOf(SearchString) + SearchString.length;
          const imgEnd = res.indexOf('"', imgBeg);
          const imagePath = `https:${res.substring(imgBeg, imgEnd)}`;
          const ext = imagePath.substring(imagePath.length - 3);

          const targetFile = `${TargetPath}/xkcd.${ext}`;
          const file = fs.createWriteStream(targetFile);
          https.get(imagePath, res => res.pipe(file));

          console.log(`Number: ${comicNumber}`, `Image: ${imagePath}`);
          const xkcd = {
              date: moment().utc().format('YYYYMMDD'),
              file: `xkcd.${ext}`,
              number: comicNumber
          }
          fs.writeFileSync("xkcd.json", JSON.stringify(xkcd), "utf8");
        }
      });
  }
}

async function main(now?: any) {
  if (now == null)  now = moment();

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

  let results: Event[] = [];
  for (let calendar of calendars) {
    const today = now.utc().format("YYYY-MM-DD");
    let objects = await tsdav.fetchCalendarObjects({
      calendar: calendar,
      headers: {
        authorization: 'Basic ' + Buffer.from(auth.username + ':' + auth.password).toString('base64')
      },
      timeRange: {
        start: `${today}T00:00:00+01:00`,
        end: `${today}T23:59:59+01:00`
      },
      expand: true
    })

    for (let o of objects) {
      let result = parseCalendarEntry(o.data);
      results.push(result);
    }
  }

  results = results.filter((e) => e && e.marked);
  results = results.sort(function(a,b) {
    if (a.startTime == undefined || b.startTime == undefined)  throw "@TMP  Error 4";
    return +a.startTime - +b.startTime
  });

  downloadXKCD(now);
  writeIndex(results);
}



//
// main
if (process.argv.length == 2) {
  // No additional arguments passed
  main();

  // const wait_time = 5 * 60 * 1000;
  // setInterval(main, wait_time);
}
else {
  const date = moment(process.argv[2]);
  main(date);
}
