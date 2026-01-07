import { render, screen } from '@testing-library/react';
import { EventList } from '../EventList';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Event } from '@/types';

// Mock types if needed, or cast
const mockEvents: Event[] = [
    {
        id: '1',
        title: 'Test Event 1',
        status: 'MANUAL_DRAFT',
        is_published: false,
        date: '2023-01-01',
        venue_name: 'Test Venue',
    } as Event,
];

describe('EventList', () => {
    it('renders events and handles edit interaction', async () => {
        const user = userEvent.setup();
        const onEdit = vi.fn();
        const props = {
            events: mockEvents,
            isLoading: false,
            selectedIds: new Set<string>(),
            onSelect: vi.fn(),
            onSelectAll: vi.fn(),
            onEdit,
            onVenueClick: vi.fn(),
            onArtistClick: vi.fn(),
        };

        render(<EventList {...props} />);

        expect(screen.getByText('Test Event 1')).toBeInTheDocument();

        // Test click
        await user.click(screen.getByText('Test Event 1'));
        expect(onEdit).toHaveBeenCalledWith(mockEvents[0]);
    });

    it('handles keyboard navigation (Enter)', async () => {
        const user = userEvent.setup();
        const onEdit = vi.fn();
        const props = {
            events: mockEvents,
            isLoading: false,
            selectedIds: new Set<string>(),
            onSelect: vi.fn(),
            onSelectAll: vi.fn(),
            onEdit,
            onVenueClick: vi.fn(),
            onArtistClick: vi.fn(),
        };

        render(<EventList {...props} />);

        const row = screen.getByRole('button', { name: /Test Event 1/i });
        row.focus();
        await user.keyboard('{Enter}');
        expect(onEdit).toHaveBeenCalledWith(mockEvents[0]);
    });
});
