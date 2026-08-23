import { cn } from "@/lib/cn";

type ExampleBadgeProps = {
  variant?: "pill" | "banner";
  className?: string;
};

export function ExampleBadge({ variant = "pill", className }: ExampleBadgeProps) {
  if (variant === "banner") {
    return (
      <div
        className={cn(
          "border-b border-border bg-accent-subtle px-6 py-3 text-center text-sm text-accent-light",
          className
        )}
      >
        This is a fictional example profile created to demonstrate Athlesite. All
        information shown is sample data.
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
