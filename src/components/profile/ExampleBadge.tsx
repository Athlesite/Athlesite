import { cn } from "@/lib/cn";

type ExampleBadgeProps = {
  variant?: "pill" | "banner" | "quiet";
  message?: string;
  className?: string;
};

export function ExampleBadge({ variant = "pill", message, className }: ExampleBadgeProps) {
  if (variant === "banner") {
    return (
      <div
        className={cn(
          "border-b border-border bg-accent-subtle px-6 py-3 text-center text-sm text-accent-light",
          className
        )}
      >
        {message ??
          "This is a fictional example profile created to demonstrate Athlesite. All information shown is sample data."}
      </div>
    );
  }

  if (variant === "quiet") {
    return (
      <div
        className={cn(
          "border-b border-border/60 px-6 py-2 text-center text-xs text-muted-foreground",
          className
        )}
      >
        {message ?? "Preview profile · saved on this device"}
      </div>
    );
  }

  return (
    <span
      className={cn(
        "rounded-full bg-accent-subtle px-3 py-1 text-xs font-medium text-accent-light",
        className
      )}
    >
      Example Athlesite
    </span>
  );
}
