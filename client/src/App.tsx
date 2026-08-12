import type { Flags, Status } from "./api";
import { Banner } from "./components/Banner";
import { Header } from "./components/Header";
import { StatusTable } from "./components/StatusTable";
import { XkcdPanel } from "./components/XkcdPanel";
import { usePolling } from "./hooks/usePolling";

const StatusInterval = 5 * 60 * 1000;
const FlagInterval = 5 * 1000;

export function App() {
  const status = usePolling<Status>("/api/status", StatusInterval);
  const flags = usePolling<Flags>("/api/flags", FlagInterval);

  // Both banners occupy the same spot, so focussing wins over being in a meeting
  const banner = flags?.focus ? "focus" : flags?.meeting ? "meeting" : null;

  if (status == null)  return null;

  return (
    <>
      <Header info={status.info} />
      <StatusTable entries={status.entries} />
      <XkcdPanel xkcd={status.xkcd} shifted={banner != null} />
      <div className={`timestamp${banner != null ? " shifted" : ""}`}>
        Last updated: {status.updatedAt}
      </div>
      {banner != null && <Banner kind={banner} />}
    </>
  );
}
