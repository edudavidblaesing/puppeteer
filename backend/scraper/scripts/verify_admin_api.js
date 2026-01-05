const fetch = global.fetch; // Node 18+

const BASE_URL = 'http://localhost:3007/db/guest-users'; // Admin routes mounted at /db/guest-users

async function runTests() {
    console.log('--- Verifying Admin Guest API ---');

    try {
        // 1. List Users
        console.log('\n[TEST] List Guest Users...');
        let res = await fetch(`${BASE_URL}?limit=5`);
        if (!res.ok) throw new Error(`List failed: ${res.status} ${res.statusText}`);
        let data = await res.json();
        console.log(`[PASS] Useers fetched: ${data.data.length} users found.`);
        if (data.data.length > 0) {
            console.log('Sample User:', JSON.stringify(data.data[0], null, 2));
        }

        // 2. Get Single User (if exists)
        if (data.data.length > 0) {
            const userId = data.data[0].id;
            console.log(`\n[TEST] Get Single User (${userId})...`);
            res = await fetch(`${BASE_URL}/${userId}`);
            if (!res.ok) throw new Error(`Get failed: ${res.status}`);
            const user = await res.json();
            console.log(`[PASS] Fetched user: ${user.username} (${user.email})`);

            // 3. Update User (Verify)
            console.log(`\n[TEST] Verification Toggle (${userId})...`);
            res = await fetch(`${BASE_URL}/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_verified: !user.is_verified })
            });
            if (!res.ok) throw new Error(`Update failed: ${res.status}`);
            const updated = await res.json();
            console.log(`[PASS] User verified status toggled to: ${updated.is_verified}`);
        } else {
            console.log('[WARN] No users to test detail/update.');
        }

        console.log('\n--- VERIFICATION SUCCESSFUL ---');
    } catch (e) {
        console.error('\n[FAILED] Error:', e.message);
        if (e.cause) console.error(e.cause);
    }
}

runTests();
