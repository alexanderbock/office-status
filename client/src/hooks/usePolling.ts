import { useEffect, useState } from "react";

export interface Polled<T> {
  data: T | null;
  lastSuccess: number | null;
}

export function usePolling<T>(url: string, interval: number): Polled<T> {
  const [ state, setState ] = useState<Polled<T>>({ data: null, lastSuccess: null });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(url);
        if (!response.ok)  throw new Error(`${url} responded with ${response.status}`);

        const value = await response.json() as T;
        if (!cancelled)  setState({ data: value, lastSuccess: Date.now() });
      }
      catch (e) {
        console.error(e);
      }
    }

    void load();
    const id = setInterval(() => void load(), interval);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ url, interval ]);

  return state;
}
