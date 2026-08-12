import { useEffect } from "react";

const CheckInterval = 60 * 1000;

// A wedged page is indistinguishable from a quiet day, so reload once polling has been
// failing for long enough. Nothing happens before the first success so that a server that
// is still starting up cannot send the page into a reload loop
export function useWatchdog(lastSuccess: number | null, timeout: number) {
  useEffect(() => {
    if (lastSuccess == null)  return;

    const id = setInterval(() => {
      if (Date.now() - lastSuccess > timeout)  location.reload();
    }, CheckInterval);
    return () => clearInterval(id);
  }, [ lastSuccess, timeout ]);
}
