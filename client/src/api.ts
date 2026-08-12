export interface StatusEntry {
  allDay: boolean;
  startLabel: string;
  endLabel: string;
  status: string;
  location: string;
  isCurrent: boolean;
}

export interface Info {
  room: string;
  division: string;
  group: string;
  name: string;
  title: string;
}

export interface Status {
  info: Info;
  entries: StatusEntry[];
  xkcd: {
    number: number;
    file: string;
  };
  updatedAt: string;
}

export interface Flags {
  meeting: boolean;
  focus: boolean;
}
