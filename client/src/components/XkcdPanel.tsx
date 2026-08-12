import type { Status } from "../api";

export function XkcdPanel({ xkcd, shifted }: { xkcd: Status["xkcd"], shifted: boolean }) {
  if (xkcd.file === "")  return null;

  return (
    <div className={`content${shifted ? " shifted" : ""}`}>
      Random XKCD (#{xkcd.number})
      <br />
      <img src={`/xkcd/${xkcd.file}`} alt={`XKCD comic ${xkcd.number}`} />
    </div>
  );
}
