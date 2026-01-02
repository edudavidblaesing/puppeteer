'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function ArtistRedirect() {
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;

    useEffect(() => {
        router.replace(`/artists?editId=${id}`);
    }, [id, router]);

    return null;
}
