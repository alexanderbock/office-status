# Office Status
A script that will generate a webpage used as a replacement for a fixed plate at the office to inform people where you are.  Everytime the script is run, it will get the events in the specified calendars via a CalDAV request and use these 
values to populate the plate.  It will also download a random XKCD image once per day and inject that into the plate.

Everytime the script runs, it will get all of the calendar entries for the current day from all calendars named in the `config.json` and will then display all of the ones that mention the string `#Status` in their description.  If a calendar entry does not have that text, it will be ignored.

## Configuration
1. Edit the `config.json`
   - `hostname`, `port`, and `path` should point at the location where the CalDAV access point is loaded
   - `target-path` is the location where the created webpage will be moved.  This path is relative to the location of the script
   - `xkcd-skip` is a list of XKCD comic numbers that should be skipped.  Currently used to ignore NSFW comics
   - `calendars` the names of the calendars from which the entries should be loaded
   - `meeting-url` the page will query this URL to see if the "Current in Meeting" banner should be shown. The URL should return a JSON object of the form `{ status: Boolean }`; if `status` is `true`, the banner is shown, if it is `false`, it will be hidden
1. Create an `auth.json` with the authentication information
   - `username` should be the username used to access the CalDAV endpoint
   - `passwort` should be the password used to access the CalDAV endpoint

## Run
1. Run `tsc` in the main folder to compile the TypeScript program into JavaScript
1. Run `node out/index.js` to start the page generation
   - If the script is started without any parameters, it will automatically generate a new page every 5 minutes
   - Passing "once" as an argument will only generate a page a single time (example: `node out/index.js once`)
   - Passing "test" will run a set of unit tests, which currently only works on my own calendar as it requires some entries
1. The page is generated in the `dist` folder which can be served by any other means
