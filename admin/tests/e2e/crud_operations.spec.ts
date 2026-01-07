
import { test, expect } from '@playwright/test';

// Mocks
const MOCK_EVENTS = [
    { id: '1', title: 'Test Event 1', status: 'pending', start_time: '18:00', date: '2025-01-01', venue_id: 'v1' }
];
const MOCK_VENUES = [
    { id: 'v1', name: 'Test Venue 1', address: '123 Test St', city: 'Berlin' }
];
const MOCK_ARTISTS = [
    { id: 'a1', name: 'Test Artist 1', type: 'dj' }
];
const MOCK_ORGANIZERS = [
    { id: 'o1', name: 'Test Organizer 1' }
];
const MOCK_CITIES = [
    { id: 1, name: 'Berlin', country_code: 'DE' }
];
const MOCK_USERS = [
    { id: 'u1', email: 'user@test.com', username: 'testuser', role: 'user' }
];

test.describe('CRUD Operations & Navigation', () => {

    test.beforeEach(async ({ page }) => {
        // Intercept API calls
        await page.route('**', async (route) => {
            const url = route.request().url();
            const method = route.request().method();

            // Auth
            if (url.includes('/auth/check')) {
                await route.fulfill({ status: 200, body: JSON.stringify({ user: { id: 1, role: 'admin' } }) });
                return;
            }

            // Stats & Dashboard Data
            if (url.includes('/db/stats') || url.includes('/scrape/history')) {
                await route.fulfill({ status: 200, body: JSON.stringify({}) });
                return;
            }

            // SINGLE GETs (for edit form) - MUST BE BEFORE LIST GETs
            if (url.match(/\/db\/events\/1/)) return route.fulfill({ status: 200, body: JSON.stringify(MOCK_EVENTS[0]) });
            if (url.match(/\/db\/venues\/v1/)) return route.fulfill({ status: 200, body: JSON.stringify(MOCK_VENUES[0]) });
            if (url.match(/\/db\/artists\/a1/)) return route.fulfill({ status: 200, body: JSON.stringify(MOCK_ARTISTS[0]) });
            if (url.match(/\/db\/organizers\/o1/)) return route.fulfill({ status: 200, body: JSON.stringify(MOCK_ORGANIZERS[0]) });
            if (url.match(/\/db\/cities\/1/)) return route.fulfill({ status: 200, body: JSON.stringify(MOCK_CITIES[0]) });
            if (url.match(/\/db\/guest-users\/u1/)) return route.fulfill({ status: 200, body: JSON.stringify(MOCK_USERS[0]) });


            // LIST GETs
            if (url.includes('/db/events') && method === 'GET') {
                await route.fulfill({ status: 200, body: JSON.stringify({ data: MOCK_EVENTS, total: 1 }) });
                return;
            }
            if (url.includes('/db/venues') && method === 'GET') {
                const isSearch = url.includes('search=');
                await route.fulfill({ status: 200, body: JSON.stringify({ data: MOCK_VENUES, total: 1 }) });
                return;
            }
            if (url.includes('/db/artists') && method === 'GET') {
                await route.fulfill({ status: 200, body: JSON.stringify({ data: MOCK_ARTISTS, total: 1 }) });
                return;
            }
            if (url.includes('/db/organizers') && method === 'GET') {
                await route.fulfill({ status: 200, body: JSON.stringify({ data: MOCK_ORGANIZERS, total: 1 }) });
                return;
            }
            if (url.includes('/db/cities') && method === 'GET') {
                await route.fulfill({ status: 200, body: JSON.stringify({ data: MOCK_CITIES }) });
                return;
            }
            if (url.includes('/db/guest-users') && method === 'GET') {
                await route.fulfill({ status: 200, body: JSON.stringify({ data: MOCK_USERS, total: 1 }) });
                return;
            }

            // UPDATES (PUT/PATCH)
            if (method === 'PUT' || method === 'PATCH') {
                await route.fulfill({ status: 200, body: JSON.stringify({ success: true, message: 'Updated successfully' }) });
                return;
            }

            await route.continue();
        });

        await page.goto('/login');
        await page.evaluate(() => localStorage.setItem('admin_token', 'fake-token'));
        await page.goto('/');
    });

    // 1. EVENTS
    test('Event: Navigate, Edit, Save', async ({ page }) => {
        await page.goto('/events');
        await expect(page.getByText('Test Event 1')).toBeVisible();

        // Click to Edit
        await page.getByText('Test Event 1').click();
        await expect(page.getByRole('heading', { name: 'Test Event 1', level: 2 })).toBeVisible();

        // Modify Title
        const titleInput = page.locator('input[name="title"]'); // Assuming name="title"
        await titleInput.fill('Updated Event Title');

        // Save
        const saveBtn = page.getByRole('button', { name: 'Save Changes' });
        await expect(saveBtn).toBeEnabled();
        await saveBtn.click();

        // Verify
        await expect(page.getByText('Event updated successfully')).toBeVisible();
    });

    // 2. VENUES
    test('Venue: Navigate, Edit, Save', async ({ page }) => {
        await page.goto('/venues');
        await expect(page.getByText('Test Venue 1')).toBeVisible();

        // Click to Edit
        await page.getByText('Test Venue 1').click();
        await expect(page.getByRole('heading', { name: 'Test Venue 1', level: 2 })).toBeVisible();

        // Modify Name
        await page.locator('input[name="name"]').fill('Updated Venue Name');

        // Save
        await page.getByRole('button', { name: 'Save Changes' }).click();
        await expect(page.getByText('Venue updated successfully')).toBeVisible();
    });

    // 3. ARTISTS
    test('Artist: Navigate, Edit, Save', async ({ page }) => {
        await page.goto('/artists');
        await expect(page.getByText('Test Artist 1')).toBeVisible();

        await page.getByText('Test Artist 1').click();
        await expect(page.getByRole('heading', { name: 'Test Artist 1', level: 2 })).toBeVisible();

        await page.locator('input[name="name"]').fill('Updated Artist');
        await page.getByRole('button', { name: 'Save Changes' }).click();
        await expect(page.getByText('Artist updated successfully')).toBeVisible();
    });

    // 4. ORGANIZERS
    test('Organizer: Navigate, Edit, Save', async ({ page }) => {
        await page.goto('/organizers');
        await expect(page.getByText('Test Organizer 1')).toBeVisible();

        await page.getByText('Test Organizer 1').click();
        await expect(page.getByRole('heading', { name: 'Test Organizer 1', level: 2 })).toBeVisible();

        await page.locator('input[name="name"]').fill('Updated Organizer');
        await page.getByRole('button', { name: 'Save Changes' }).click();
        await expect(page.getByText('Organizer updated successfully')).toBeVisible();
    });

    // 5. CITIES
    test('City: Navigate, Edit, Save', async ({ page }) => {
        await page.goto('/cities');
        await expect(page.getByText('Berlin')).toBeVisible();

        await page.getByText('Berlin').click();
        await expect(page.getByRole('heading', { name: 'Berlin', level: 2 })).toBeVisible();
        await expect(page.locator('input[name="name"]')).toBeVisible();

        await page.locator('input[name="name"]').fill('Berlin Updated');
        await page.getByRole('button', { name: 'Save Changes' }).click();
        await expect(page.getByText('City updated successfully')).toBeVisible();
    });

    // 6. GUEST USERS (Regression Check)
    test('User: Navigate, Edit, Save', async ({ page }) => {
        await page.goto('/users');
        await expect(page.getByText('testuser')).toBeVisible();

        // Click user
        await page.getByText('testuser').click();
        await expect(page.getByRole('heading', { name: 'testuser', level: 2 })).toBeVisible();

        // Modify username
        await page.locator('input[name="username"]').fill('updateduser');
        await page.getByRole('button', { name: 'Save Changes' }).click();
        await expect(page.getByText('User updated successfully')).toBeVisible();
    });

    // 7. KEYBOARD NAV (Enter key)
    test('Keyboard Navigation: Open Edit on via Enter', async ({ page }) => {
        await page.goto('/events');
        await expect(page.getByText('Test Event 1')).toBeVisible();

        // Initial focus state might require a click or tab
        await page.keyboard.press('ArrowDown'); // Focus first item
        await page.keyboard.press('Enter');

        await expect(page.getByRole('heading', { name: 'Test Event 1', level: 2 })).toBeVisible();
    });

});
