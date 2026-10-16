"use client";

import { cn } from "@/utils";
import { SelectHTMLAttributes, forwardRef, useId } from "react";

interface SelectOption {
  value: string | number;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, placeholder, id, ...props }, ref) => {
    const generatedId = useId();
    id = id ?? generatedId;
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? id + "-error" : undefined}
          className={cn(
            "w-full rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 focus:bg-white",
            error ? "border-red-500 focus:ring-red-500" : "border-gray-300",
            className,
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <p id={id + "-error"} className="text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = "Select";
export default Select;
