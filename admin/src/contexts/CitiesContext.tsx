import React, { createContext, useContext, ReactNode } from 'react';
import { useCities } from '@/hooks/useCities';

type CitiesContextType = ReturnType<typeof useCities>;

const CitiesContext = createContext<CitiesContextType | null>(null);

export function CitiesProvider({ children }: { children: ReactNode }) {
    const citiesData = useCities();

    return (
        <CitiesContext.Provider value={citiesData}>
            {children}
        </CitiesContext.Provider>
    );
}

export function useCitiesContext() {
    const context = useContext(CitiesContext);
    if (!context) {
        throw new Error('useCitiesContext must be used within a CitiesProvider');
    }
    return context;
}
