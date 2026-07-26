// src/components/VerifiedTick.tsx
export default function VerifiedTick({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0" style={{ background: color }} title={label}>
      <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
        <path d="M2.5 6L4.5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
