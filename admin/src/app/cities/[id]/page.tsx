'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function CityRedirect() {
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;

    useEffect(() => {
        router.replace(`/cities?editId=${id}`);
    }, [id, router]);

    return null;
}
