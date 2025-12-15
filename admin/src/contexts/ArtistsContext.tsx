import React, { createContext, useContext, ReactNode } from 'react';
import { useArtists } from '@/hooks/useArtists';

type ArtistsContextType = ReturnType<typeof useArtists>;

const ArtistsContext = createContext<ArtistsContextType | null>(null);

export function ArtistsProvider({ children }: { children: ReactNode }) {
    const artistsData = useArtists();

    return (
        <ArtistsContext.Provider value={artistsData}>
            {children}
        </ArtistsContext.Provider>
    );
}

export function useArtistsContext() {
    const context = useContext(ArtistsContext);
    if (!context) {
        throw new Error('useArtistsContext must be used within a ArtistsProvider');
    }
    return context;
}
