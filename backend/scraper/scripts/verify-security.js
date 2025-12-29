const API_URL = 'http://localhost:3007'; // Direct to backend
const DEFAULT_USER = { username: 'admin', password: 'TheKey4u' };

async function verifySecurity() {
    console.log('🔒 Starting Security & Validation Verification...');
    let token = '';

    // Helper for fetch
    const request = async (path, method = 'GET', body = null, headers = {}) => {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };
        if (body) options.body = JSON.stringify(body);
        return await fetch(`${API_URL}${path}`, options);
    };

    // 1. Login
    try {
        console.log('\n--- Step 1: Login ---');
        const res = await request('/auth/login', 'POST', DEFAULT_USER);
        if (res.ok) {
            const data = await res.json();
            token = data.token;
            console.log('✅ Login Successful');
        } else {
            console.error('❌ Login Failed:', res.status, await res.text());
            return;
        }
    } catch (e) {
        console.error('❌ Login Failed:', e.message);
        return;
    }

    // 2. Test Unprotected Read (Public) - e.g. List Events
    try {
        console.log('\n--- Step 2: Public Read Access (List Events) ---');
        const res = await request('/db/events?limit=1');
        if (res.ok) console.log('✅ Public Read Successful');
    } catch (e) {
        console.error('❌ Public Read Failed:', e.message);
    }

    // 3. Test Protected Write WITHOUT Token (Create Venue)
    try {
        console.log('\n--- Step 3: Protected Write WITHOUT Token ---');
        const res = await request('/db/venues', 'POST', { name: 'Hacker Venue' });
        if (res.status === 401 || res.status === 403) {
            console.log('✅ Request Blocked as expected (401/403)');
        } else {
            console.error('❌ Failed: Request succeeded but should have been 401/403. Status:', res.status);
        }
    } catch (e) {
        console.error('❌ Unexpected Error:', e.message);
    }

    // 4. Test Protected Write WITH Token but INVALID Data (Create Venue)
    try {
        console.log('\n--- Step 4: Protected Write WITH Token (Invalid Data) ---');
        // Missing 'name' which is required
        const res = await request(
            '/db/venues',
            'POST',
            { city: 'Berlin' },
            { Authorization: `Bearer ${token}` }
        );

        if (res.status === 400) {
            console.log('✅ Request Blocked as expected (400 Bad Request)');
            console.log('   Error Message:', await res.text());
        } else {
            console.error('❌ Failed: Expected 400 but got:', res.status);
        }
    } catch (e) {
        console.error('❌ Unexpected Error:', e.message);
    }

    // 5. Test Protected Write WITH Token and VALID Data (Create Venue)
    try {
        console.log('\n--- Step 5: Protected Write WITH Token (Valid Data) ---');
        const testVenue = {
            name: `Test Venue ${Date.now()}`,
            city: 'Test City',
            address: '123 Test St'
        };
        const res = await request(
            '/db/venues',
            'POST',
            testVenue,
            { Authorization: `Bearer ${token}` }
        );
        if (res.ok) {
            const data = await res.json();
            console.log('✅ Creation Successful');
            console.log('   Venue ID:', data.venue.id);
        } else {
            console.error('❌ Creation Failed with status:', res.status, await res.text());
        }
    } catch (e) {
        console.error('❌ Creation Failed:', e.message);
    }
}

verifySecurity();
