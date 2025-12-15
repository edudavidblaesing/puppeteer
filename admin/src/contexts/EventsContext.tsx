import React, { createContext, useContext, ReactNode } from 'react';
import { useEvents } from '@/hooks/useEvents';
import { Event } from '@/types';

type EventsContextType = ReturnType<typeof useEvents>;

const EventsContext = createContext<EventsContextType | null>(null);

export function EventsProvider({ children }: { children: ReactNode }) {
    const eventsData = useEvents();

    return (
        <EventsContext.Provider value={eventsData}>
            {children}
        </EventsContext.Provider>
    );
}

export function useEventsContext() {
    const context = useContext(EventsContext);
    if (!context) {
        throw new Error('useEventsContext must be used within an EventsProvider');
    }
    return context;
}
