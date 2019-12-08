const fs = require('fs');
const http = require('https');
const moment = require('moment-timezone');

// TODO: Get location from calendar entry
// TODO: Get adjacent calendar entries

//
// Global setup
let AuthFile = JSON.parse(fs.readFileSync('auth.json'));
let ConfigFile = JSON.parse(fs.readFileSync('config.json'));
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

  const beg = text.indexOf('SUMMARY:');
  if (beg == -1) {
    // We got a value back that did not contain a SUMMARY list
    return [ null, null, null ];
  }
  else {
    const status = text.substring(beg + 'SUMMARY'.length + 1, text.indexOf('\n', beg));
    const startTime = parseTime('DTSTART;');
    const endTime = parseTime('DTEND;');
    return [ startTime, endTime, status ];
  }
}

function writeIndex(status, isAsleep, nowLocal) {
  const SourceFile = 'template.html';
  const TargetFile = 'index.html';
  const TargetPath = '../public/office-status/';

  if (fs.existsSync(TargetFile)) {
    fs.unlinkSync(TargetFile);
  }
  const template = fs.readFileSync(SourceFile, 'utf8');

  if (status == null) {
    if (isAsleep) {
      status = "Probably home";
    }
    else {
      const Shrug = '¯\\_(ツ)_/¯';
      status = "Here, having a coffee, or &nbsp;" + Shrug;
    }
  }

  const nowStr = nowLocal.format('YYYY-MM-DD HH:mm:ss');
  const c1 = template.replace('%%%STATUS%%%', status);
  const c2 = c1.replace('%%%TIMESTAMP%%%', 'Last updated: ' + nowStr);
  const content = c2;

  fs.writeFileSync(TargetFile, content, 'utf8');

  if (fs.existsSync(TargetPath + '/' + TargetFile)) {
    fs.unlinkSync(TargetPath + '/' + TargetFile);
  }
  fs.renameSync(TargetFile, TargetPath + '/' + TargetFile);
}



function requestCalendarEntry(time, localTime, isAsleep) {
  const req = http.request(requestOptions(), (res) => {
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      const [ startTime, endTime, status ] = parseCalendarEntry(chunk);
      if (startTime && endTime && status) {
        writeIndex('(' + startTime.format('HH:mm') + '-' + endTime.format('HH:mm') + ') ' + status, isAsleep, localTime);
      }
      else {
        writeIndex(null, isAsleep, localTime);
      }
    });
    res.on('error', (e) => {
      console.log(e.message);
      writeIndex('Error: ' + e.message, isAsleep, localTime);
    });
  });

  const DateFormat = 'YYYYMMDDTHHmmss';
  const nowStr = time.utc().format(DateFormat);
  const thenStr = time.add(1, 'seconds').utc().format(DateFormat);

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

const now = moment();
const localNow = now.tz('Europe/Stockholm');
const h = localNow.hours();
const outOfWorkingHours = h <= WorkingHours[0] || h >= WorkingHours[1];
requestCalendarEntry(now, localNow, outOfWorkingHours);
