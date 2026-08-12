export interface StatusEntry {
  allDay: boolean;
  startLabel: string;
  endLabel: string;
  status: string;
  location: string;
  isCurrent: boolean;
}

export interface Status {
  info: {
    room: string;
    division: string;
    group: string;
    name: string;
    title: string;
  };
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

let status: Status | null = null;
let flags: Flags = { meeting: false, focus: false };

export function getStatus(): Status | null {
  return status;
}

export function setStatus(value: Status) {
  status = value;
}

export function getFlags(): Flags {
  return flags;
}

export function setFlags(value: Partial<Flags>) {
  flags = { ...flags, ...value };
}
