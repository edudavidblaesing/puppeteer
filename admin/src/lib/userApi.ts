import { User } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3007';
const headers = {
    'Content-Type': 'application/json',
    'x-api-key': process.env.NEXT_PUBLIC_API_KEY || '',
};

export async function fetchUsers() {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/db/users`, {
        headers: { ...headers, Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch users');
    const json = await response.json();
    return json.data || [];
}

export async function createUser(data: Partial<User>) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/db/users`, {
        method: 'POST',
        headers: { ...headers, Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to create user');
    }
    return response.json();
}

export async function deleteUser(id: number | string) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/db/users/${id}`, {
        method: 'DELETE',
        headers: { ...headers, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('Failed to delete user');
    return response.json();
}
