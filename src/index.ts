import moment from "moment-timezone";

import { generate_page } from "./generate_page";
import { setup_hosting } from "./hosting"

async function main() {
  if (process.argv.length == 2) {
    // No additional arguments passed
    await generate_page();

    const wait_time = 5 * 60 * 1000;
    setInterval(generate_page, wait_time);
  }
  else {
    // Test case
    const date = moment("1985-08-27 12:00:00");
    generate_page(date);
  }

  setup_hosting();
}

main();
