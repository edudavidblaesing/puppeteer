'use client';

import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { useState } from 'react';
import { useToast } from '@/contexts/ToastContext';

export default function ReactQueryProvider({ children }: { children: React.ReactNode }) {
    const { error: showError } = useToast();

    const [queryClient] = useState(() => new QueryClient({
        mutationCache: new MutationCache({
            onError: (error) => {
                showError(error.message || 'An error occurred');
            },
        }),
        defaultOptions: {
            queries: {
                staleTime: 1000 * 60 * 5, // 5 minutes
                refetchOnWindowFocus: false,
            },
        },
    }));

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}
