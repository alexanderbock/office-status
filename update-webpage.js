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
  function parseTime(token) {
    const timeBeg = text.indexOf(token);
    const time = text.substring(timeBeg + token.length, text.indexOf('\n', timeBeg));

    let timeTZ = 'UTC';
    if (time.substring(0, 'TZID'.length) == 'TZID') {
      // If we have a regular entry, the first value is going to be the timezone identifier
      timeTZ = time.substring('TZID='.length, time.indexOf(':'));
    }
    else if (time.substring(0, 'VALUE'.length) == 'VALUE') {
      // We have a full day entry, so there is no timezone identifier (at least in the
      // ones created in Fantastical)
    }
    else {
      console.log(time.substring(0, 'TZID'.length));
      console.log('ERROR parsing date for data: ', text);
    }
    const timeTime = time.substring(time.indexOf(':') + 1);
    const timeMoment = moment.tz(timeTime, timeTZ);
    return timeMoment;
  }

  function parseLocation() {
    // Need to check against \nLOCATION: instead of LOCATION: as there might be another
    // key that has LOCATION as the last word; particularly 'X-LIC-LOCATION'
    const beg = text.indexOf('\nLOCATION:');
    if (beg == -1) {
      return null;
    }
    else {
      const end = text.indexOf('\n', beg + '\nLOCATION'.length);
      const location = text.substring(beg + '\nLOCATION'.length + 1, end);
      return location;
    }
  }

  const beg = text.indexOf('SUMMARY:');
  if (beg == -1) {
    // We got a value back that did not contain a SUMMARY list
    return null;
  }
  else {
    const location = parseLocation();
    const startTime = parseTime('DTSTART;');
    const endTime = parseTime('DTEND;');

    // Checking whether the entry is a full day entry.  The way this is stored in the
    // calendar heavily depends on the calendar application that was used to create the
    // entry as the CalDAV standard is quiet about full day events.  Fantastical stores
    // them as events lasting from 00:00 of day i to 00:00 of day i+1
    const startDay = startTime.format('DD');
    const startHourMinute = startTime.format('HH:mm');
    const endDay = endTime.format('DD');
    const endHourMinute = endTime.format('HH:mm');
    const isFullDayEntry = (parseInt(startDay) + 1 === parseInt(endDay)) &&
                           (startHourMinute === endHourMinute);

    let ordering;
    const now = moment();
    if (now >= startTime && now <= endTime) {
      ordering = 'current';
    }
    else {
      ordering = 'other';
    }
    return {
      status: text.substring(beg + 'SUMMARY'.length + 1, text.indexOf('\n', beg)),
      startTime: startTime,
      endTime: endTime,
      isFullDayEntry: isFullDayEntry,
      ordering: ordering,
      location: location
    };
  }
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
      if (e.isFullDayEntry) {
        result += `<td class="time">Full day</td>`;
      }
      else {
        const start = e.startTime.format('HH:mm');
        const end = e.endTime.format('HH:mm');
        result += `<td class="time">(${start}&ndash;${end})</td>`;
      }
      result += `<td class="status">${e.status}</td>`
      result += `<td class="location">${location}</td>`;
      result += '</tr>';
      status += result;
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

function downloadXKCD(now) {
  // If the previous download is more than a day old, download a new file. This download will
  // probably take longer than the other parts of this file, so the first update of the day
  // might still use the old XKCD image, but who cares
  if (now >= moment(XKCD.date).add(1, 'day')) {
      console.log(`Downloading new XKCD. Now: ${now.format('YYYYMMDD')}, Previous: ${XKCD.date}`);
      request('https://c.xkcd.com/random/comic/', (error, response, body) => {
        const comicNumber = response.request.href.substring('https://xkcd.com/'.length).slice(0, -1);
        if (ConfigFile['xkcd-skip'].includes(comicNumber)) {
          console.log(`Skipping comic ${comicNumber} due to blacklisting`);
        }
        else {
          const imageText = `Random XKCD (#${comicNumber})`;

          // The missing / is because in some of the XKCD that line is split into two
          const SearchString = 'Image URL (for hotlinking/embedding): https://imgs.xkcd.com/comics';
          const imgBeg = response.body.indexOf(SearchString) + SearchString.length;
          const imgEnd = response.body.indexOf('.', imgBeg) + '.png'.length;
          const imagePath = `https://imgs.xkcd.com/comics/${response.body.substring(imgBeg, imgEnd)}`;
          const ext = imagePath.substring(imagePath.length - 3);

          const targetFile = TargetPath + 'xkcd.' + ext;
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

function updateWebpage(now) {
  // Trigger the update of the webpage
  const today = now.utc().format('YYYYMMDD');
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
    path: ConfigFile['path'],
    method: 'REPORT',
    headers: {
      'Content-Type': 'text/xml',
      'Depth': 1,
      'Authorization': 'Basic ' + Buffer.from(Username + ':' + Password).toString('base64')
    }
  };

  const req = https.request(options, res => {
    res.setEncoding('utf8');
    res.on('data', chunk => {
      const json = parser.parse(chunk);

      // Extract the calendar entry information
      let responses = json['d:multistatus']['d:response'];
      if (responses) {
        if (!Array.isArray(responses)) {
          // This is the case if the calendar only contains a single entry this day
          responses = [ responses ];
        }
        const lst = responses.map(v => v['d:propstat']['d:prop']['cal:calendar-data']);
        const entries = lst.map(v => parseCalendarEntry(v));
        const sortedEntries = entries.sort(function(a,b) { return a.startTime > b.startTime; });
        writeIndex(sortedEntries);
      }
      else {
        writeIndex(null);
      }
    });
  });
  req.write(msg);
  req.end();
}

//
// main
const now = moment();
downloadXKCD(now);
updateWebpage(now);
