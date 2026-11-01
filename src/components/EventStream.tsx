import { useEffect, useRef } from 'react';

interface EventStreamProps {
  events: string[];
}

export function EventStream({ events }: EventStreamProps) {
  const termRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <section className="box">
      <h2>
        <span>Event stream</span>
        <span>real, in order</span>
      </h2>
      <div id="term" ref={termRef}>
        {events.map((line, idx) => (
          <div key={idx}>{line}</div>
        ))}
      </div>
    </section>
  );
}
