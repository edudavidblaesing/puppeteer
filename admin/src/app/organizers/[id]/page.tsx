'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function OrganizerRedirect() {
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;

    useEffect(() => {
        router.replace(`/organizers?editId=${id}`);
    }, [id, router]);

    return null;
}
