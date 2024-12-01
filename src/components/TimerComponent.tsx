"use client";

import { useEffect, useState } from "react";

const TimerComponent = ({ startTime }: { startTime: string }) => {
  const [elapsedTime, setElapsedTime] = useState("");

  useEffect(() => {
    const start = new Date(startTime).getTime();

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const diff = now - start;

      const hours = Math.floor(diff / (1000 * 60 * 60))
        .toString()
        .padStart(2, "0");
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        .toString()
        .padStart(2, "0");
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
        .toString()
        .padStart(2, "0");

      setElapsedTime(`${hours}:${minutes}:${seconds}`);
    }, 1000);

    return () => clearInterval(interval); // Limpia el intervalo al desmontar
  }, [startTime]);

  return <span>{elapsedTime}</span>;
};

export default TimerComponent;
