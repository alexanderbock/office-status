import type { StatusEntry } from "../api";

export function StatusTable({ entries }: { entries: StatusEntry[] }) {
  if (entries.length === 0) {
    return <div className="status">{"¯\\_(ツ)_/¯"}</div>;
  }

  return (
    <div className="status">
      <table className="entries">
        <tbody>
          {entries.map((entry, index) => {
            const emphasis = entry.isCurrent ? "current" : "other";
            return (
              <tr key={index} className={`entry ${emphasis}${entry.isPast ? " past" : ""}`}>
                <td className="time">
                  {entry.allDay ? "All-day" : `(${entry.startLabel}\u2013${entry.endLabel})`}
                </td>
                <td className="status">{entry.status}</td>
                <td className="location">{entry.location}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
