import React, { createContext, useContext, ReactNode } from 'react';
import { useOrganizers } from '@/hooks/useOrganizers';

type OrganizersContextType = ReturnType<typeof useOrganizers>;

const OrganizersContext = createContext<OrganizersContextType | null>(null);

export function OrganizersProvider({ children }: { children: ReactNode }) {
    const organizersData = useOrganizers();

    return (
        <OrganizersContext.Provider value={organizersData}>
            {children}
        </OrganizersContext.Provider>
    );
}

export function useOrganizersContext() {
    const context = useContext(OrganizersContext);
    if (!context) {
        throw new Error('useOrganizersContext must be used within a OrganizersProvider');
    }
    return context;
}
