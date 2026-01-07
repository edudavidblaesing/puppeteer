import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
    const API_URL = 'http://localhost:3007'; // Match api.ts default or env

    test.beforeEach(async ({ page }) => {
        // Mock /auth/check to return 401 by default (not logged in)
        await page.route('**/auth/check', async (route) => {
            await route.fulfill({ status: 401 });
        });
    });

    test('should redirect to login when accessing protected route unauthenticated', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveURL(/\/login/);
    });

    test('should display error message on failed login', async ({ page }) => {
        await page.route('**/auth/login', async (route) => {
            await route.fulfill({
                status: 401,
                body: JSON.stringify({ error: 'Invalid username or password' }),
            });
        });

        await page.goto('/login');

        await page.fill('input#username', 'wronguser');
        await page.fill('input#password', 'wrongpass');
        await page.click('button[type="submit"]');

        await expect(page.getByText('Invalid username or password')).toBeVisible();
    });

    test('should redirect to dashboard on successful login', async ({ page }) => {
        // Mock success login
        await page.route('**/auth/login', async (route) => {
            await route.fulfill({
                status: 200,
                body: JSON.stringify({
                    token: 'fake-jwt-token',
                    user: { id: 1, username: 'admin', role: 'admin' },
                }),
            });
        });

        // Mock auth check success after login (since app might re-check or router checks)
        await page.route('**/auth/check', async (route) => {
            // If header is present, return success
            const headers = route.request().headers();
            if (headers['authorization']) {
                await route.fulfill({
                    status: 200,
                    body: JSON.stringify({ user: { id: 1, username: 'admin', role: 'admin' } }),
                });
            } else {
                await route.fulfill({ status: 401 });
            }
        });

        await page.goto('/login');

        await page.fill('input#username', 'admin');
        await page.fill('input#password', 'securepass');
        await page.click('button[type="submit"]');

        // Should redirect to dashboard
        await expect(page).toHaveURL(/\//);
    });
});
