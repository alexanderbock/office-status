A script that will generate a webpage used as a replacement for a fixed plate at the office to inform people where you are.  Everytime the script is run, it will get the events in a specific calendar via a CalDAV request and use these values to populate the plate.  It will also download a random XKCD image once per day and inject that into the plate.

Usage:
  1. Edit the `config.json`
    * `hostname`, `port`, and `path` should point at the location where the CalDAV access point is loaded
    * `parget-path` is the location where the created webpage will be moved.  This path is relative to the location of the script
    * `xkcd-skip` is a list of XKCD comic numbers that should be skipped.  Currently used to ignore NSFW comics
  1. Create an `auth.json` with the authentication information
    * `username` should be the username used to access the CalDAV endpoint
    * `passwort` should be the password used to access the CalDAV endpoint
