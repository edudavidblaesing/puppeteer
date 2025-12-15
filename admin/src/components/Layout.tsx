import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <main className="flex-1 flex flex-col overflow-hidden h-[calc(100vh-64px)]">
        {children}
      </main>
    </div>
  );
}
