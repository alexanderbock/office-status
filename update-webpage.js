'use strict';

const fs = require('fs');
const https = require('https');
const moment = require('moment-timezone');
const parser = require('fast-xml-parser');
const request = require('request');

//
// Global setup
const AuthFile = JSON.parse(fs.readFileSync('auth.json'));
const ConfigFile = JSON.parse(fs.readFileSync('config.json'));
const XKCD = JSON.parse(fs.readFileSync('xkcd.json'));

const TargetPath = ConfigFile['target-path'];


// Given a CalDAV entry, it returns the starting time, ending time, and the summary of the
// entry
function parseCalendarEntry(text) {
  function parseTime(line) {
    let timeTZ = 'UTC';
    let isFullDay = false;
    if (line.startsWith('TZID')) {
      // If we have a regular entry, the first value is going to be the timezone identifier
      timeTZ = line.substring('TZID='.length, line.indexOf(':'));
    }
    else if (line.startsWith('VALUE')) {
      // We have a full day entry, so there is no timezone identifier (at least in the
      // ones created in Fantastical)
      isFullDay = true;
    }
    else {
      console.error(line.substring(0, 'TZID'.length));
      console.error('ERROR parsing date for data: ', line);
    }
    // Get the date, but then remove the day component as that might be different
    let time = line.substring(line.indexOf(':') + 1).substring('YYYYMMDD'.length);
    // Attach the day component of today to the hhmmss of the event
    const timeMoment = moment.tz(moment().utc().format('YYYYMMDD') + time, timeTZ);
    return {
      datetime: timeMoment,
      fullDay: isFullDay
    };
  }

  const lines = text.split('\n');

  let events = [];
  let event = {};
  let inEvent = false;
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];
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

    if (line.startsWith('DTSTART;')) {
      event['start'] = parseTime(line.substr('DTSTART;'.length));
    }

    if (line.startsWith('DTEND;')) {
      event['end'] = parseTime(line.substr('DTEND;'.length));
    }

    if (line.startsWith('SUMMARY:')) {
      event['summary'] = line.substring('SUMMARY:'.length);
    }

    if (line.startsWith('LOCATION:')) {
      event['location'] = line.substr('LOCATION:'.length);
    }

    if (line.startsWith('DESCRIPTION:')) {
      let desc = line.substr('DESCRIPTION'.length);
      event['marked'] = desc.includes("#status");
    }

    if (line.startsWith('LAST-MODIFIED:')) {
      event['modified'] = moment.tz(line.substring('LAST-MODIFIED:'.length), 'UTC');
    }
  }

  // There might be many events for the same *actual* event, they are in random order but
  // do have a modified date. So we can sort by the modified date and just take the first
  // one and discard the rest
  events.sort((lhs, rhs) => rhs.modified - lhs.modified);
  let e = events[0];

  let ordering;
  const now = moment();
  if (now >= e.start.datetime && now <= e.end.datetime) {
    ordering = 'current';
  }
  else {
    ordering = 'other';
  }

  return {
    status: e.summary,
    startTime: e.start.datetime.clone().tz("Europe/Stockholm"),
    endTime: e.end.datetime.clone().tz("Europe/Stockholm"),
    isFullDayEntry: e.start.fullDay && e.end.fullDay,
    ordering: ordering,
    location: e.location,
    marked: e.marked
  };
}


function writeIndex(statuses) {
  const SourceFile = 'template.html';
  const TargetFile = 'index.html';

  let template = fs.readFileSync(SourceFile, 'utf8');

  if (statuses == null) {
    template = template.replace('%%%STATUS%%%', '¯\\_(ツ)_/¯');
  }
  else {
    let status = '<table class="entries">';
    statuses.forEach(e => {
      const location = e.location || '';

      let result = `<tr class="entry" id="${e.ordering}">`;
      const start = e.startTime.format('HH:mm');
      const end = e.endTime.format('HH:mm');
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
        result += '</tr>';
        status += result;
      }
    });
    status += '</table>';
    template = template.replace('%%%STATUS%%%', status);
  }

  template = template.replace('%%%CONTENT-TEXT%%%', `Random XKCD (#${XKCD.number})`);
  template = template.replace('%%%CONTENT%%%', XKCD.file);

  template = template.replace('%%%TIMESTAMP%%%', `Last updated: ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
  fs.writeFileSync(TargetFile, template, 'utf8');

  if (fs.existsSync(TargetPath + '/' + TargetFile)) {
    fs.unlinkSync(TargetPath + '/' + TargetFile);
  }
  fs.renameSync(TargetFile, TargetPath + '/' + TargetFile);
}

function downloadXKCD(time) {
  // If the previous download is more than a day old, download a new file. This download will
  // probably take longer than the other parts of this file, so the first update of the day
  // might still use the old XKCD image, but who cares
  if (time >= moment(XKCD.date).add(1, 'day')) {
      console.log(`Downloading new XKCD. Now: ${time.format('YYYYMMDD')}, Previous: ${XKCD.date}`);
      request('https://c.xkcd.com/random/comic/', (error, response, body) => {
        const comicNumber = response.request.href.substring('https://xkcd.com/'.length).slice(0, -1);
        if (ConfigFile['xkcd-skip'].includes(comicNumber)) {
          console.log(`Skipping comic ${comicNumber} due to blacklisting`);
        }
        else {
          const imageText = `Random XKCD (#${comicNumber})`;
          const res = response.body.replace(/\n/g, "").replace(/\t/g, "");

          const SearchString = '<div id="comic"><img src="';
          const imgBeg = res.indexOf(SearchString) + SearchString.length;
          const imgEnd = res.indexOf('"', imgBeg);
          const imagePath = `https:${res.substring(imgBeg, imgEnd)}`;
          const ext = imagePath.substring(imagePath.length - 3);

          const targetFile = TargetPath + '/xkcd.' + ext;
          const file = fs.createWriteStream(targetFile);
          https.get(imagePath, res => res.pipe(file));

          console.log(`Number: ${comicNumber}`, `Image: ${imagePath}`);
          const xkcd = {
              date: moment().utc().format('YYYYMMDD'),
              file: 'xkcd.' + ext,
              number: comicNumber
          }
          fs.writeFile('xkcd.json', JSON.stringify(xkcd), 'utf8', function() {});
        }
      });
  }
}

async function updateWebpage(time, calendar) {
  // Trigger the update of the webpage
  const today = time.utc().format('YYYYMMDD');
  const msg = `
  <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
    <d:prop> <d:getetag /> <c:calendar-data /> </d:prop>
    <c:filter>
      <c:comp-filter name="VCALENDAR"> <c:comp-filter name="VEVENT">
          <c:time-range start="${today}T000000" end="${today}T235959" />
      </c:comp-filter> </c:comp-filter>
    </c:filter>
  </c:calendar-query>`;

  const Username = AuthFile['username'];
  const Password = AuthFile['password'];
  const options = {
    hostname: ConfigFile['hostname'],
    port: ConfigFile['port'],
    path: ConfigFile['path'] + '/' + calendar,
    method: 'REPORT',
    headers: {
      'Content-Type': 'text/xml',
      'Depth': 1,
      'Authorization': 'Basic ' + Buffer.from(Username + ':' + Password).toString('base64')
    }
  };

  return await new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      res.setEncoding('utf8');
      let body = '';
      res.on('data', chunk => {
        body += chunk;
      }).on('end', () => {
        let chunk = body;
        const json = parser.parse(chunk);
  
        // Extract the calendar entry information
        let responses = json['d:multistatus']['d:response'];
        if (responses) {
          if (!Array.isArray(responses)) {
            // This is the case if the calendar only contains a single entry this day
            responses = [ responses ];
          }
          let lst = responses.map(v => v['d:propstat']['d:prop']['cal:calendar-data']);
          lst = lst.filter(v => v != null);
  
          const entries = lst.map(v => parseCalendarEntry(v));
          resolve(entries);
        }
        else {
          resolve(null);
        }
      }).on('error', (error) => {
        reject(error);
      });
    });
    req.write(msg);
    req.end();
  });
}

async function main(now) {
  if (now == null)  now = moment();
  let results = [];
  for (let idx in ConfigFile["calendars"]) {
    let cal = ConfigFile["calendars"][idx];
    let r = await updateWebpage(now, cal);
    results = results.concat(r);
  }
  results = results.filter((e) => e.marked);
  results = results.sort((a,b) => a.startTime - b.startTime);

  downloadXKCD(now);
  writeIndex(results);
}

//
// main
if (process.argv.length == 2) {
  // No additional arguments passed
  main();

  const wait_time = 5 * 60 * 1000;
  setInterval(main, wait_time);
}
else {
  const date = moment(process.argv[2]);
  main(date);
}

