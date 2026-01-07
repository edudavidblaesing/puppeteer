import React from 'react';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
    value: string;
    label: string;
}


interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: React.ReactNode;
    error?: string;
    options?: SelectOption[];
    containerClassName?: string;
    fullWidth?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
    ({ className, label, error, options, children, id, containerClassName, fullWidth = true, ...props }, ref) => {
        const generatedId = React.useId();
        const selectId = id || generatedId;
        const errorId = `${selectId}-error`;

        return (
            <div className={clsx(fullWidth ? "w-full" : "w-auto inline-block", containerClassName)}>
                {label && (
                    <label htmlFor={selectId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {label}
                    </label>
                )}
                <div className="relative">
                    <select
                        ref={ref}
                        id={selectId}
                        aria-invalid={!!error}
                        aria-describedby={error ? errorId : undefined}
                        className={clsx(
                            'w-full rounded-lg border bg-white px-3 py-2 text-sm appearance-none transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-900 dark:text-gray-100 pr-10',
                            error
                                ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                                : 'border-gray-300 focus:border-primary-500 dark:border-gray-700',
                            className
                        )}
                        {...props}
                    >
                        {options
                            ? options.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))
                            : children}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                        <ChevronDown className="h-4 w-4" />
                    </div>
                </div>
                {error && (
                    <p id={errorId} className="mt-1 text-xs text-red-500">
                        {error}
                    </p>
                )}
            </div>
        );
    }
);

Select.displayName = 'Select';
