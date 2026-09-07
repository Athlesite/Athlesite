"use client";

import { useId } from "react";

type RangeFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  formatValue?: (value: number) => string;
};

export function RangeField({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  formatValue = (v) => `${Math.round(v * 100)}%`,
}: RangeFieldProps) {
  const id = useId();

  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        <span className="text-xs text-muted-foreground">{formatValue(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-surface accent-accent"
      />
    </div>
  );
}
