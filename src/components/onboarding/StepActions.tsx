import { Button } from "@/components/ui/Button";

type StepActionsProps = {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
};

export function StepActions({ onBack, onNext, nextLabel = "Continue" }: StepActionsProps) {
  return (
    <div className="mt-10 flex items-center justify-between gap-4 border-t border-border pt-6">
      {onBack ? (
        <Button type="button" variant="secondary" onClick={onBack}>
          Back
        </Button>
      ) : (
        <span />
      )}
      {onNext ? (
        <Button type="button" onClick={onNext}>
          {nextLabel}
        </Button>
      ) : null}
    </div>
  );
}
