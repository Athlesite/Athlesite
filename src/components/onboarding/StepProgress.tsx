import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/cn";

type StepProgressProps = {
  labels: string[];
  currentIndex: number;
};

export function StepProgress({ labels, currentIndex }: StepProgressProps) {
  return (
    <div className="border-b border-border bg-surface/40">
      <Container className="py-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground sm:hidden">
          <span>
            Step {currentIndex + 1} of {labels.length}
          </span>
          <span className="font-medium text-foreground">{labels[currentIndex]}</span>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border sm:hidden">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${((currentIndex + 1) / labels.length) * 100}%` }}
          />
        </div>

        <ol className="hidden items-center sm:flex">
          {labels.map((label, index) => (
            <li key={label} className="flex flex-1 items-center last:flex-none">
              <span
                aria-current={index === currentIndex ? "step" : undefined}
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium",
                  index <= currentIndex
                    ? "bg-accent text-accent-foreground"
                    : "border border-border text-muted-foreground"
                )}
              >
                {index + 1}
              </span>
              <span
                className={cn(
                  "ml-2 whitespace-nowrap text-xs font-medium",
                  index === currentIndex ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
              {index < labels.length - 1 ? (
                <span aria-hidden="true" className="mx-3 h-px flex-1 bg-border" />
              ) : null}
            </li>
          ))}
        </ol>
      </Container>
    </div>
  );
}
