import type { Flags, Status } from "./api";
import { Banner } from "./components/Banner";
import { Header } from "./components/Header";
import { StatusTable } from "./components/StatusTable";
import { XkcdPanel } from "./components/XkcdPanel";
import { useDarkMode } from "./hooks/useDarkMode";
import { usePolling } from "./hooks/usePolling";
import { useWatchdog } from "./hooks/useWatchdog";

const StatusInterval = 5 * 60 * 1000;
const FlagInterval = 5 * 1000;
const WatchdogTimeout = 15 * 60 * 1000;

export function App() {
  const status = usePolling<Status>("/api/status", StatusInterval);
  const flags = usePolling<Flags>("/api/flags", FlagInterval);

  useDarkMode();
  useWatchdog(status.lastSuccess, WatchdogTimeout);

  // Both banners occupy the same spot, so focussing wins over being in a meeting
  const banner = flags.data?.focus ? "focus" : flags.data?.meeting ? "meeting" : null;

  if (status.data == null)  return null;

  return (
    <>
      <Header info={status.data.info} />
      <StatusTable entries={status.data.entries} />
      <XkcdPanel xkcd={status.data.xkcd} shifted={banner != null} />
      <div className={`timestamp${banner != null ? " shifted" : ""}`}>
        Last updated: {status.data.updatedAt}
      </div>
      {banner != null && <Banner kind={banner} />}
    </>
  );
}
