import type { Metadata } from 'next';
// import { Inter } from 'next/font/google';
import './globals.css';
import { Navigation } from '@/components/Navigation';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { CommandPalette } from '@/components/ui/CommandPalette';
import ReactQueryProvider from '@/contexts/ReactQueryProvider';

// const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Events Admin Dashboard',
  description: 'Manage and publish events from various sources',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.css"
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.Default.css"
        />
      </head>
      <body className={`font-sans h-screen overflow-hidden bg-white dark:bg-gray-950`}>
        <ToastProvider>
          <ReactQueryProvider>
            <AuthProvider>
              <div className="h-full flex bg-gray-50 dark:bg-gray-950">
                <div className="flex-shrink-0 h-full">
                  <Navigation />
                </div>
                <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                  {children}
                </main>
                <CommandPalette />
              </div>
            </AuthProvider>
          </ReactQueryProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
