// Using global fetch (Node 18+) or dynamic import
// const fetch = require('node-fetch'); 

const BASE_URL = 'http://localhost:3007/api/guest';

async function runVerification() {
    console.log('--- Verifying Guest App API ---');

    // 1. Register
    const unique = Date.now();
    const registerPayload = {
        email: `guest_${unique}@test.com`,
        password: 'password123',
        username: `guest_${unique}`,
        full_name: 'Test Guest'
    };

    console.log(`\n1. Registering user: ${registerPayload.username}...`);
    let res = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerPayload)
    });

    if (!res.ok) {
        console.error('Registration failed:', await res.text());
        return;
    }

    let data = await res.json();
    console.log('✅ Registration successful. Token received.');
    const token = data.token;

    // 2. Login (Double check)
    console.log('\n2. Verifying Login...');
    res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: registerPayload.email, password: registerPayload.password })
    });

    if (!res.ok) console.error('Login failed');
    else console.log('✅ Login successful.');

    // 3. Get Profile
    console.log('\n3. Fetching Profile...');
    res = await fetch(`${BASE_URL}/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    data = await res.json();
    if (!data.user) {
        console.error('❌ Failed to fetch profile:', data);
        return;
    }
    console.log(`✅ Profile fetched: ${data.user.full_name} (${data.user.email})`);

    // 4. Map Events
    console.log('\n4. Fetching Map Events...');
    res = await fetch(`${BASE_URL}/events/map?lat=52.5&lng=13.4&radius=10`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    data = await res.json();
    console.log(`✅ Map connection successful. Found ${data.data ? data.data.length : 0} events.`);

    // 5. Chats
    console.log('\n5. Fetching Chats...');
    res = await fetch(`${BASE_URL}/chats`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    data = await res.json();
    console.log(`✅ Chat connection successful. Chats count: ${data.data ? data.data.length : 0}`);

    console.log('\n--- Verification Complete ---');
}

runVerification().catch(console.error);
