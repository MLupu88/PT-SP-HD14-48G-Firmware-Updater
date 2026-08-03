import type { ReactNode } from "react";

interface ReadinessChecklistProps {
  readonly deviceConnected: boolean;
  readonly firmwareValid: boolean;
  readonly allReady: boolean;
  readonly onStart: () => void;
}

function Item({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li>
      <span className={`icon ${done ? "check" : "pending"}`} aria-hidden="true">
        {done ? "✓" : "…"}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Reminder({ children }: { children: ReactNode }) {
  return (
    <li>
      <span className="icon info" aria-hidden="true">
        i
      </span>
      <span>{children}</span>
    </li>
  );
}

export function ReadinessChecklist({
  deviceConnected,
  firmwareValid,
  allReady,
  onStart,
}: ReadinessChecklistProps) {
  return (
    <section className="card">
      <h2>Ready to update</h2>
      <ul className="checklist">
        <Item done={deviceConnected}>Device connected</Item>
        <Item done={firmwareValid}>Compatible firmware selected</Item>
        <Reminder>Keep your device connected to power for the whole update</Reminder>
        <Reminder>Keep this browser tab open until the update finishes</Reminder>
      </ul>
      <button type="button" className="btn btn-primary" disabled={!allReady} onClick={onStart}>
        Start update
      </button>
    </section>
  );
}
