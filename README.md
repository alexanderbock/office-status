# Office Status
A webpage used as a replacement for a fixed plate at the office to inform people where you are.  The server periodically fetches the events of the current day from the specified calendars via a CalDAV request and serves them as JSON; a React frontend renders the plate and refreshes itself.  A random XKCD image is downloaded once per day and shown at the bottom of the page.

Only calendar entries whose description mentions the string `#status` are displayed, all others are ignored.  If a calendar entry contains the string `#anon` in the description, the plate will show "Busy" as the entry and will remove the location before displaying the entry.

## Structure
The repository is an npm workspace with two packages:
 - `server` fetches the calendar entries and the XKCD comic and exposes them through a JSON API.  It also serves the built frontend
 - `client` is the Vite + React frontend that renders the plate

## Configuration
1. Copy `config-template.json` to `config.json`
   - `hostingPort` is the port on which the server listens
   - `hostname` and `path` should point at the location where the CalDAV access point is loaded
   - `xkcd-skip` is a list of XKCD comic numbers that should be skipped.  Currently used to ignore NSFW comics
   - `calendars` the names of the calendars from which the entries should be loaded
   - `info` is an object that contains the personal information that is displayed at the top of the page and must contain the keys `room`, `division`, `group`, `name`, and `title`
1. Copy `auth-template.json` to `auth.json` and fill in the authentication information
   - `username` should be the username used to access the CalDAV endpoint
   - `password` should be the password used to access the CalDAV endpoint
   - `webpassword` is the password protecting the page itself and the shared secret used to toggle the meeting and focus banners

Both files are read at runtime, so changing them only requires a restart, not a rebuild.

## Run
1. `npm install`
1. `npm run build` to compile the server and to bundle the frontend
1. `npm start` to start the server.  The status is regenerated every 5 minutes, the page is available at `http://localhost:<hostingPort>/` and is protected by basic authentication with the username `office` and the `webpassword`
   - Passing a date as an argument generates the status for that day a single time instead (example: `npm start -- 1985-08-27`)

For development, `npm run dev` starts the server together with the Vite dev server on port 5173, which proxies `/api` and `/xkcd` to the server.

## API
All routes except `POST /api/flags` are behind the same basic authentication as the page.

| Route | Description |
| --- | --- |
| `GET /api/status` | The information, calendar entries, and current comic used to render the page |
| `GET /api/flags` | `{ "meeting": Boolean, "focus": Boolean }` |
| `POST /api/flags` | Sets either flag, for example `{ "focus": true }`.  Requires the header `Authorization: Bearer <webpassword>` |

If both flags are set, the focus banner takes precedence as they occupy the same space.
