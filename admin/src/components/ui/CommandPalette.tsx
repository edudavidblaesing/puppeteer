'use client';

import { Fragment, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, Combobox, Transition, DialogPanel, TransitionChild, ComboboxInput, ComboboxOptions, ComboboxOption } from '@headlessui/react';
import { Search, Calendar, MapPin, Users, Building2, Plus, Home, Settings, Moon, Sun, Command, Globe } from 'lucide-react';
import clsx from 'clsx';
// import { useTheme } from '@/contexts/ThemeContext'; // Assuming we have one, or simple class toggle

type Item = {
    id: string;
    name: string;
    category: 'Navigation' | 'Actions' | 'Theme';
    shortcut?: string[];
    icon: any;
    action: () => void;
};

export function CommandPalette() {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const router = useRouter();

    // Basic command list
    const items: Item[] = [
        // Navigation
        { id: 'nav-dash', name: 'Go to Dashboard', category: 'Navigation', icon: Home, action: () => router && router.push('/') },
        { id: 'nav-events', name: 'Go to Events', category: 'Navigation', icon: Calendar, action: () => router.push('/events') },
        { id: 'nav-venues', name: 'Go to Venues', category: 'Navigation', icon: MapPin, action: () => router.push('/venues') },
        { id: 'nav-artists', name: 'Go to Artists', category: 'Navigation', icon: Users, action: () => router.push('/artists') },
        { id: 'nav-organizers', name: 'Go to Organizers', category: 'Navigation', icon: Building2, action: () => router.push('/organizers') },
        { id: 'nav-cities', name: 'Go to Cities', category: 'Navigation', icon: Globe, action: () => router.push('/cities') },

        // Actions
        { id: 'act-new-event', name: 'Create New Event', category: 'Actions', shortcut: ['N'], icon: Plus, action: () => router.push('/events/new') },
        { id: 'act-new-venue', name: 'Create New Venue', category: 'Actions', icon: Plus, action: () => router.push('/venues/new') },
        { id: 'act-new-artist', name: 'Create New Artist', category: 'Actions', icon: Plus, action: () => router.push('/artists/new') },
        { id: 'act-new-organizer', name: 'Create New Organizer', category: 'Actions', icon: Plus, action: () => router.push('/organizers/new') },
    ];

    const filteredItems = query === ''
        ? items
        : items.filter((item) => {
            return item.name.toLowerCase().includes(query.toLowerCase());
        });

    // Groups for rendering
    const groups = ['Navigation', 'Actions'];

    useEffect(() => {
        const onKeydown = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setIsOpen((open) => !open);
            }

            // Global shortcut for 'New Event' (N)
            // Only if not typing in input
            if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
                // Optional: Trigger Action directly? Or just open palette?
                // Let's make it direct action for power users
                router.push('/events/new');
            }
        };

        window.addEventListener('keydown', onKeydown);
        return () => window.removeEventListener('keydown', onKeydown);
    }, [router]);

    return (
        <Transition.Root show={isOpen} as={Fragment} afterLeave={() => setQuery('')}>
            <Dialog as="div" className="relative z-50" onClose={setIsOpen}>
                <TransitionChild
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-gray-500/25 dark:bg-black/50 backdrop-blur-sm transition-opacity" />
                </TransitionChild>

                <div className="fixed inset-0 z-10 w-screen overflow-y-auto p-4 sm:p-6 md:p-20">
                    <TransitionChild
                        as={Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0 scale-95"
                        enterTo="opacity-100 scale-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100 scale-100"
                        leaveTo="opacity-0 scale-95"
                    >
                        <DialogPanel className="mx-auto max-w-xl transform divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden rounded-xl bg-white dark:bg-gray-900 shadow-2xl ring-1 ring-black/5 transition-all">
                            <Combobox onChange={(item: Item | null) => {
                                if (item) {
                                    item.action();
                                    setIsOpen(false);
                                }
                            }}>
                                <div className="relative">
                                    <Search
                                        className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-gray-400"
                                        aria-hidden="true"
                                    />
                                    <ComboboxInput
                                        className="h-12 w-full border-0 bg-transparent pl-11 pr-4 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-0 sm:text-sm"
                                        placeholder="Search..."
                                        onChange={(event) => setQuery(event.target.value)}
                                        autoComplete="off"
                                    />
                                </div>

                                {filteredItems.length > 0 && (
                                    <ComboboxOptions static className="max-h-96 scroll-py-3 overflow-y-auto p-3">
                                        {groups.map((group) => {
                                            const groupItems = filteredItems.filter((item) => item.category === group);
                                            if (groupItems.length === 0) return null;

                                            return (
                                                <div key={group}>
                                                    <div className="text-xs font-semibold text-gray-500 bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 -mx-3 mb-2 mt-2 first:mt-0 sticky top-0 backdrop-blur-sm">
                                                        {group}
                                                    </div>
                                                    {groupItems.map((item) => (
                                                        <ComboboxOption
                                                            key={item.id}
                                                            value={item}
                                                            className={({ active }) =>
                                                                clsx(
                                                                    'flex cursor-default select-none items-center rounded-lg px-3 py-2',
                                                                    active ? 'bg-primary-600 text-white' : 'text-gray-900 dark:text-gray-100'
                                                                )
                                                            }
                                                        >
                                                            {({ active }) => (
                                                                <>
                                                                    <div className={clsx("flex h-8 w-8 flex-none items-center justify-center rounded-lg", active ? 'bg-primary-700' : 'bg-gray-100 dark:bg-gray-800')}>
                                                                        <item.icon className={clsx("h-5 w-5", active ? 'text-white' : 'text-gray-500 dark:text-gray-400')} aria-hidden="true" />
                                                                    </div>
                                                                    <span className="ml-3 flex-auto truncate text-sm font-medium">{item.name}</span>
                                                                    {item.shortcut && (
                                                                        <span className={clsx("ml-3 flex-none text-xs font-semibold", active ? 'text-primary-100' : 'text-gray-500')}>
                                                                            <kbd className="font-sans">{item.shortcut.join('')}</kbd>
                                                                        </span>
                                                                    )}
                                                                </>
                                                            )}
                                                        </ComboboxOption>
                                                    ))}
                                                </div>
                                            )
                                        })}
                                    </ComboboxOptions>
                                )}

                                {query !== '' && filteredItems.length === 0 && (
                                    <p className="p-4 text-sm text-gray-500 text-center">No results found.</p>
                                )}

                                <div className="flex flex-wrap items-center bg-gray-50 dark:bg-gray-800/50 py-2.5 px-4 text-xs text-gray-500 border-t border-gray-100 dark:border-gray-800">
                                    <Command className="w-3 h-3 mr-1" /> <span className="mr-4">K to open</span>
                                    <span className="mr-4">Type <kbd className="font-bold font-sans">N</kbd> for new event</span>
                                    <span className="flex-1"></span>
                                    <span>Pro Tip: Use arrow keys to navigate</span>
                                </div>
                            </Combobox>
                        </DialogPanel>
                    </TransitionChild>
                </div>
            </Dialog>
        </Transition.Root>
    );
}
