import React, { createContext, useContext, ReactNode } from 'react';
import { useVenues } from '@/hooks/useVenues';

type VenuesContextType = ReturnType<typeof useVenues>;

const VenuesContext = createContext<VenuesContextType | null>(null);

export function VenuesProvider({ children }: { children: ReactNode }) {
    const venuesData = useVenues();

    return (
        <VenuesContext.Provider value={venuesData}>
            {children}
        </VenuesContext.Provider>
    );
}

export function useVenuesContext() {
    const context = useContext(VenuesContext);
    if (!context) {
        throw new Error('useVenuesContext must be used within a VenuesProvider');
    }
    return context;
}
