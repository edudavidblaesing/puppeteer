import React from 'react';
import { Listbox } from '@headlessui/react';
import { Check, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { SourceIcon } from '@/components/ui/SourceIcon';

export interface RichSelectOption {
    value: string;
    label: string;
    icon?: React.ReactNode;
    sourceCode?: string; // For Source Icons
    badgeColor?: string; // For Status Badges
    description?: string;
    count?: number;
}

interface RichSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: RichSelectOption[];
    placeholder?: string;
    className?: string;
    fullWidth?: boolean;
}

export function RichSelect({ value, onChange, options, placeholder = "Select...", className, fullWidth = false }: RichSelectProps) {
    const selectedOption = options.find(o => o.value === value) || null;

    return (
        <div className={clsx("relative", fullWidth ? "w-full" : "w-auto min-w-[140px]", className)}>
            <Listbox value={value} onChange={onChange}>
                <Listbox.Button className="relative w-full cursor-default rounded-lg bg-white dark:bg-gray-900 py-1.5 pl-3 pr-10 text-left border border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 sm:text-sm">
                    <span className="flex items-center gap-2 truncate">
                        {/* Selected Value Rendering */}
                        {selectedOption ? (
                            <>
                                {selectedOption.sourceCode && (
                                    <SourceIcon sourceCode={selectedOption.sourceCode} className="w-4 h-4" />
                                )}
                                {selectedOption.badgeColor && (
                                    <span className={clsx("w-2 h-2 rounded-full", selectedOption.badgeColor)}></span>
                                )}
                                {selectedOption.icon && !selectedOption.sourceCode && (
                                    <span className="w-4 h-4 flex items-center justify-center">{selectedOption.icon}</span>
                                )}
                                <span className="block truncate text-gray-900 dark:text-gray-100">{selectedOption.label}</span>
                            </>
                        ) : (
                            <span className="block truncate text-gray-400">{placeholder}</span>
                        )}
                    </span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                        <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
                    </span>
                </Listbox.Button>

                <Listbox.Options
                    anchor="bottom start"
                    className="z-50 min-w-[var(--button-width)] rounded-xl bg-white dark:bg-gray-900 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm border border-gray-100 dark:border-gray-800 transition duration-100 ease-in data-[leave]:data-[closed]:opacity-0"
                >
                    {options.map((option) => (
                        <Listbox.Option
                            key={option.value}
                            className={({ active }) =>
                                clsx(
                                    "relative cursor-default select-none py-2 pl-3 pr-9 transition-colors",
                                    active ? "bg-primary-50 dark:bg-primary-900/20 text-primary-900 dark:text-primary-100" : "text-gray-900 dark:text-gray-100"
                                )
                            }
                            value={option.value}
                        >
                            {({ selected }) => (
                                <>
                                    <div className="flex items-center gap-3">
                                        {/* Option Icon Logic */}
                                        {option.sourceCode && (
                                            <div className="shrink-0">
                                                <SourceIcon sourceCode={option.sourceCode} className="w-5 h-5" />
                                            </div>
                                        )}
                                        {option.badgeColor && (
                                            <div className={clsx("w-2.5 h-2.5 shrink-0 rounded-full", option.badgeColor)}></div>
                                        )}
                                        {option.icon && !option.sourceCode && (
                                            <div className="shrink-0 text-gray-400">{option.icon}</div>
                                        )}

                                        <div className="flex flex-col">
                                            <span className={clsx("block truncate", selected ? 'font-medium' : 'font-normal')}>
                                                {option.label}
                                            </span>
                                            {option.description && (
                                                <span className="text-xs text-gray-400 font-normal">{option.description}</span>
                                            )}
                                        </div>
                                    </div>

                                    {selected ? (
                                        <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-primary-600 dark:text-primary-400">
                                            <Check className="h-4 w-4" aria-hidden="true" />
                                        </span>
                                    ) : null}
                                </>
                            )}
                        </Listbox.Option>
                    ))}
                </Listbox.Options>
            </Listbox>
        </div>
    );
}
