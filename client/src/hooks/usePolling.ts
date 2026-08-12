import { useEffect, useState } from "react";

export function usePolling<T>(url: string, interval: number): T | null {
  const [ data, setData ] = useState<T | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(url);
        if (!response.ok)  throw new Error(`${url} responded with ${response.status}`);

        const value = await response.json() as T;
        if (!cancelled)  setData(value);
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

  return data;
}
