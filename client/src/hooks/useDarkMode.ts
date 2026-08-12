import { useEffect, useState } from "react";

const LightStartHour = 8;
const LightEndHour = 18;
const CheckInterval = 60 * 1000;

function isDark(date: Date): boolean {
  const hour = date.getHours();
  return hour < LightStartHour || hour >= LightEndHour;
}

export function useDarkMode() {
  const [ dark, setDark ] = useState(() => isDark(new Date()));

  useEffect(() => {
    const id = setInterval(() => setDark(isDark(new Date())), CheckInterval);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [ dark ]);
}
