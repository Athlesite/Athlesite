export function ProfileContactPath({ label }: { label: string }) {
  return (
    <span className="mt-4 inline-flex w-fit items-center rounded-full border border-dashed border-[var(--athlete-accent)] bg-surface px-4 py-2 text-xs font-medium text-[var(--athlete-accent-light)]">
      {label}
    </span>
  );
}
