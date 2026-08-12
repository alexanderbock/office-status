import type { Info } from "../api";

export function Header({ info }: { info: Info }) {
  return (
    <>
      <div className="heading" id="room">{info.room}</div>
      <hr className="main" />
      <div className="heading" id="division">{info.division}</div>
      <div className="group">{info.group}</div>
      <hr className="main" />
      <div className="name">{info.name}</div>
      <div className="title">{info.title}</div>
      <hr className="second" />
    </>
  );
}
