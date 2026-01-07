import { test, expect } from '@playwright/test';

// Default empty stats object avoiding crashes
const EMPTY_STATS = {
    events: { total: 0, approved: 0, pending: 0, rejected: 0, active: 0, new_24h: 0, new_7d: 0, updated_24h: 0 },
    venues: 0,
    artists: 0,
    organizers: 0,
    scraping: { total: 0, new_24h: 0, last_run: null, active_sources: [], next_scheduled: '' }
};

test.describe('Dashboard States', () => {
    test.beforeEach(async ({ page }) => {
        // Verbose logging for debug
        page.on('console', msg => console.log('LOG:', msg.text()));

        // Intercept all requests to prevent 404s/401s from real backend
        await page.route('**', async (route) => {
            const url = route.request().url();

            if (url.includes('/auth/check')) {
                await route.fulfill({ status: 200, body: JSON.stringify({ user: { id: 1, role: 'admin' } }) });
                return;
            }

            if (url.includes('/db/stats')) {
                await route.fulfill({ status: 200, body: JSON.stringify(EMPTY_STATS) });
                return;
            }

            if (url.includes('/db/cities') || url.includes('scrape/history')) {
                await route.fulfill({ status: 200, body: JSON.stringify({ data: [] }) });
                return;
            }

            if (url.includes('/db/events')) {
                // Default empty list
                await route.fulfill({ status: 200, body: JSON.stringify({ data: [], total: 0 }) });
                return;
            }

            // Fallback for assets/nextjs
            await route.continue();
        });

        // Set token
        await page.goto('/login');
        await page.evaluate(() => localStorage.setItem('admin_token', 'fake-token-123'));
    });

    test('should show skeletons while loading', async ({ page }) => {
        // Override stats to delay
        await page.route(url => url.toString().includes('/db/stats'), async (route) => {
            await new Promise(r => setTimeout(r, 1000));
            await route.fulfill({ status: 200, body: JSON.stringify(EMPTY_STATS) });
        });

        await page.goto('/');
        await expect(page.locator('.animate-pulse').first()).toBeVisible({ timeout: 5000 });
    });

    test('should show empty state when no events found', async ({ page }) => {
        await page.goto('/events');
        await expect(page.getByText('No results found')).toBeVisible({ timeout: 5000 });
        await expect(page.getByText('Try adjusting your filters')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Clear Filters' })).toBeVisible();
    });

    test('should show error state on API failure', async ({ page }) => {
        // Override stats to fail
        await page.route(url => url.toString().includes('/db/stats'), async (route) => {
            await route.fulfill({ status: 500, body: JSON.stringify({ message: 'Internal Server Error' }) });
        });

        await page.goto('/');
        await expect(page.getByText('Something went wrong')).toBeVisible({ timeout: 5000 });
        await expect(page.getByRole('button', { name: 'Reload Page' })).toBeVisible();
    });

    test('should render event list items when data exists', async ({ page }) => {
        // Override events to return data
        await page.route(url => url.toString().includes('/db/events'), async (route) => {
            await route.fulfill({
                status: 200,
                body: JSON.stringify({
                    data: [{ id: '1', title: 'Test Event 1', start_time: '18:00', date: '2025-01-01' }],
                    total: 1
                })
            });
        });

        await page.goto('/events');
        await expect(page.getByText('Test Event 1')).toBeVisible({ timeout: 5000 });
    });
});
