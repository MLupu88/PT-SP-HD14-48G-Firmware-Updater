const STEPS = ["Connect", "Choose firmware", "Ready", "Update", "Done"] as const;

export type StepIndex = 0 | 1 | 2 | 3 | 4;

export function StepIndicator({ current }: { current: StepIndex }) {
  return (
    <nav className="step-indicator" aria-label="Update progress steps">
      {STEPS.map((label, index) => {
        const state = index < current ? "done" : index === current ? "active" : "";
        return (
          <span key={label} className={`step ${state}`.trim()} aria-current={index === current ? "step" : undefined}>
            {label}
          </span>
        );
      })}
    </nav>
  );
}
