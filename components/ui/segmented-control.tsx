"use client";

import { Fragment } from "react";

export interface SegmentOption {
  id: string;
  label: string;
  icon?: string;
}

interface SegmentedControlProps {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Apple-style segmented control for tab navigation.
 * Renders a sleek horizontal button group with smooth transitions.
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  className = "",
}: SegmentedControlProps) {
  return (
    <div
      className={`inline-flex rounded-lg border border-border bg-surface-container p-1 shadow-xs ${className}`}
      role="tablist"
    >
      {options.map((option) => (
        <button
          key={option.id}
          onClick={() => onChange(option.id)}
          role="tab"
          aria-selected={value === option.id}
          className={`
            relative flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium
            transition-all duration-200 ease-out
            ${
              value === option.id
                ? "bg-white text-ink shadow-xs"
                : "text-muted hover:text-ink"
            }
          `}
        >
          {option.icon && (
            <span className="material-symbols-outlined text-[18px]">
              {option.icon}
            </span>
          )}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
