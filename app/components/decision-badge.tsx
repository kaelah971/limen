export type DecisionState = "PASS" | "HOLD" | "REVIEW";

export function DecisionBadge({ decision }: { decision: DecisionState }) {
  return (
    <span className={`decision-badge decision-${decision.toLowerCase()}`}>
      <span className={`decision-mark decision-mark-${decision.toLowerCase()}`} aria-hidden="true" />
      <span>{decision}</span>
    </span>
  );
}

export function ContextTag({ children }: { children: React.ReactNode }) {
  return <span className="context-tag">{children}</span>;
}
