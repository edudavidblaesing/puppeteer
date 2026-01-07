import { render, screen } from '@testing-library/react';
import { ArtistForm } from '../ArtistForm';
import { VenueForm } from '../VenueForm';
import { describe, it, vi } from 'vitest';
import { ToastProvider } from '@/contexts/ToastContext';

// Mock API calls to avoid network requests
vi.mock('@/lib/api', () => ({
    fetchCountries: vi.fn().mockResolvedValue([{ name: 'Germany', code: 'DE' }]),
    fetchCities: vi.fn().mockResolvedValue([]),
    fetchArtist: vi.fn(),
    fetchVenue: vi.fn(),
    getBestSourceForField: vi.fn(),
}));

const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <ToastProvider>{children}</ToastProvider>
);

describe('Form Standardization Smoke Tests', () => {
    it('ArtistForm renders with new components', () => {
        render(
            <Wrapper>
                <ArtistForm
                    onSubmit={vi.fn()}
                    onCancel={vi.fn()}
                />
            </Wrapper>
        );
        // Check for Labels associated with Select/Textarea
        screen.getByLabelText(/type/i); // Select
        screen.getByLabelText(/country/i); // Select
        screen.getByLabelText(/bio/i); // Textarea
    });

    it('VenueForm renders with new components', () => {
        render(
            <Wrapper>
                <VenueForm
                    onSubmit={vi.fn()}
                    onCancel={vi.fn()}
                />
            </Wrapper>
        );
        // Check for Labels
        screen.getByLabelText(/venue type/i); // Select
        screen.getByLabelText(/description/i); // Textarea
    });
});
