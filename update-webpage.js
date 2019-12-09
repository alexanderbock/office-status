'use strict';

const fs = require('fs');
const http = require('https');
const moment = require('moment-timezone');

// TODO: Get location from calendar entry
// TODO: Get adjacent calendar entries
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
    // Need to check against \nLOCATION: instead of LOCATION: as there might be another key that has
    // LOCATION as the last word; particularly 'X-LIC-LOCATION'
    const beg = text.indexOf('\nLOCATION:');
    const end = text.indexOf('\n', beg + '\nLOCATION'.length);
    if (beg == -1) {
      return null;
    }
    else {
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
    const status = text.substring(beg + 'SUMMARY'.length + 1, text.indexOf('\n', beg));
    const location = parseLocation();
    const startTime = parseTime('DTSTART;');
    const endTime = parseTime('DTEND;');
    return {
      status: status,
      startTime: startTime,
      endTime: endTime,
      location: location
    };
  }
}

function formatEntry(entry, isCurrent) {
  const start = entry.startTime.format('HH:mm');
  const end = entry.endTime.format('HH:mm');
  const status = entry.status;
  const location = entry.location || '';

  let id;
  if (isCurrent == -1) {
    id = 'previous';
  }
  else if (isCurrent == 0) {
    id = 'current';
  }
  else if (isCurrent == 1) {
    id = 'next';
  }

  let result = `<div class="entry" id="${id}">`;
  result += '<div class="time">' + '(' + start + '-' + end + ')' + '</div>';
  result += '<div class="status">' + status + '</div>'
  result += '<div class="location">' + location + '</div>';
  result += '</div>';
  return result;
}

function writeIndex(status, isAsleep) {
  const SourceFile = 'template.html';
  const TargetFile = 'index.html';
  const TargetPath = '../public/office-status/';

  if (fs.existsSync(TargetFile)) {
    fs.unlinkSync(TargetFile);
  }
  const template = fs.readFileSync(SourceFile, 'utf8');

  // Something is wrong with the capturing of the surrounding nowTime
  const nowTime = moment();

  if (status == null) {
    const h = nowTime.hours();
    const outOfWorkingHours = h <= WorkingHours[0] || h >= WorkingHours[1];

    if (outOfWorkingHours) {
      status = "Probably home";
    }
    else {
      const Shrug = '¯\\_(ツ)_/¯';
      status = "Here, having a coffee, or &nbsp;" + Shrug;
    }
  }

  const c1 = template.replace('%%%STATUS%%%', status);
  const c2 = c1.replace('%%%TIMESTAMP%%%', 'Last updated: ' + nowTime.format('YYYY-MM-DD HH:mm:ss'));
  const content = c2;

  fs.writeFileSync(TargetFile, content, 'utf8');

  if (fs.existsSync(TargetPath + '/' + TargetFile)) {
    fs.unlinkSync(TargetPath + '/' + TargetFile);
  }
  fs.renameSync(TargetFile, TargetPath + '/' + TargetFile);
}



function requestCalendarEntry(time, isAsleep) {
  const req = http.request(requestOptions(), (res) => {
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      const result = parseCalendarEntry(chunk);
      if (result == null) {
        writeIndex(null, isAsleep);
      }
      else {
        const s = formatEntry(result);
        writeIndex(s, isAsleep);
      }
    });
    res.on('error', (e) => {
      console.log(e.message);
      writeIndex('Error: ' + e.message, isAsleep);
    });
  });

  const DateFormat = 'YYYYMMDDTHHmmss';
  const nowStr = nowTime.utc().format(DateFormat);
  const thenStr = nowTime.add(1, 'seconds').utc().format(DateFormat);

  const msg = `
  <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
    <d:prop> <d:getetag /> <c:calendar-data /> </d:prop>
    <c:filter>
      <c:comp-filter name="VCALENDAR"> <c:comp-filter name="VEVENT">
          <c:time-range start="${nowStr}" end="${thenStr}" />
      </c:comp-filter> </c:comp-filter>
    </c:filter>
  </c:calendar-query>`;

  try {
    req.write(msg);
    req.end();
  }
  catch(error) {
    console.log(error);
    writeIndex(null, isAsleep);
  }
}


//
// main
const nowTime = moment();
requestCalendarEntry();
