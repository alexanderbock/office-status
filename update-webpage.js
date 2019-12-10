'use strict';

const fs = require('fs');
const https = require('https');
const moment = require('moment-timezone');
const parser = require('fast-xml-parser');
const request = require('request');

// TODO: Add random XKCD comic at the bottom
// TODO(maybe): Add random OpenSpace/paper video at the bottom

//
// Global setup
const AuthFile = JSON.parse(fs.readFileSync('auth.json'));
const ConfigFile = JSON.parse(fs.readFileSync('config.json'));
const Username = AuthFile['username'];
const Password = AuthFile['password'];
const Hostname = ConfigFile['hostname'];
const Port = ConfigFile['port'];
const Path = ConfigFile['path'];
const WorkingHours = ConfigFile['working-hours'];
const BasicAuth = 'Basic ' + Buffer.from(Username + ':' + Password).toString('base64');



// Returns the request options used for asking for calendar entries
function requestOptions() {
  return {
    hostname: Hostname,
    port: Port,
    path: Path,
    method: 'REPORT',
    headers: {
      'Content-Type': 'text/xml',
      'Depth': 1,
      'Authorization': BasicAuth
    }
  };
}

// Given a CalDAV entry, it returns the starting time, ending time, and the summary of the
// entry
function parseCalendarEntry(text) {
  function parseTime(token) {
    const timeBeg = text.indexOf(token);
    const time = text.substring(timeBeg + token.length, text.indexOf('\n', timeBeg));
    const timeTZ = time.substring('TZID='.length, time.indexOf(':'));
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
    return null
  }
  else {
    const startTime = parseTime('DTSTART;');
    const endTime = parseTime('DTEND;');
    let ordering;
    const now = moment();
    if (now >= startTime && now <= endTime) {
      ordering = 'current';
    }
    else if (now >= endTime) {
      ordering = 'previous';
    }
    else if (now <= startTime) {
      ordering = 'next';
    }
    return {
      status: text.substring(beg + 'SUMMARY'.length + 1, text.indexOf('\n', beg)),
      startTime: startTime,
      endTime: endTime,
      ordering: ordering,
      location: parseLocation()
    };
  }
}

function writeIndex(statuses, imagePath) {
  const SourceFile = 'template.html';
  const TargetFile = 'index.html';
  const TargetPath = '../public/office-status/';

  if (fs.existsSync(TargetFile)) {
    fs.unlinkSync(TargetFile);
  }
  let template = fs.readFileSync(SourceFile, 'utf8');

  const now = moment();
  if (statuses == null) {
    const h = now.hours();
    const outOfWorkingHours = h <= WorkingHours[0] || h >= WorkingHours[1];

    if (outOfWorkingHours) {
      template = template.replace('%%%STATUS%%%', 'Probably home');
    }
    else {
      template = template.replace('%%%STATUS%%%', 'Here, having a coffee, or &nbsp;¯\\_(ツ)_/¯');
    }
  }
  else {
    let status = '<table class="entries">';
    statuses.forEach(e => {
      const start = e.startTime.format('HH:mm');
      const end = e.endTime.format('HH:mm');
      const location = e.location || '';

      let result = `<tr class="entry" id="${e.ordering}">`;
      result += `<td class="time">(${start}&ndash;${end})</td>`;
      result += `<td class="status">${e.status}</td>`
      result += `<td class="location">${location}</td>`;
      result += '</tr>';
      status += result;
    });
    status += '</table>';
    template = template.replace('%%%STATUS%%%', status);
  }

  template = template.replace('%%%CONTENT%%%', imagePath);

  template = template.replace('%%%TIMESTAMP%%%', 'Last updated: ' + now.format('YYYY-MM-DD HH:mm:ss'));
  fs.writeFileSync(TargetFile, template, 'utf8');

  if (fs.existsSync(TargetPath + '/' + TargetFile)) {
    fs.unlinkSync(TargetPath + '/' + TargetFile);
  }
  fs.renameSync(TargetFile, TargetPath + '/' + TargetFile);
}


//
// main
const req = https.request(requestOptions(), res => {
  res.setEncoding('utf8');
  res.on('data', chunk => {
    const json = parser.parse(chunk);

    // Extract the calendar entry information
    let responses = json['d:multistatus']['d:response'];
    if (!Array.isArray(responses)) {
      // This is the case if the calendar only contains a single entry this day
      responses = [ responses ];
    }
    const lst = responses.map(v => v['d:propstat']['d:prop']['cal:calendar-data']);
    const entries = lst.map(v => parseCalendarEntry(v));
    const sortedEntries = entries.sort(function(a,b) { return a.startTime > b.startTime; });

    request('https://c.xkcd.com/random/comic/', (error, response, body) => {
      const content = response.body;
      const SearchString = 'Image URL (for hotlinking/embedding): https://imgs.xkcd.com/comics/';
      const imgBeg = content.indexOf(SearchString) + SearchString.length;
      const imgEnd = content.indexOf('.png', imgBeg) + '.png'.length;
      const imagePath = 'https://imgs.xkcd.com/comics/' + content.substring(imgBeg, imgEnd);
      writeIndex(sortedEntries, imagePath);
    });
  });
});

const today = moment().utc().format('YYYYMMDD');
const msg = `
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop> <d:getetag /> <c:calendar-data /> </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR"> <c:comp-filter name="VEVENT">
        <c:time-range start="${today}T000000" end="${today}T235959" />
    </c:comp-filter> </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

req.write(msg);
req.end();
