'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Trash2, Shield, Database, Layout, RefreshCw, AlertTriangle } from 'lucide-react';
import { resetDatabase } from '@/lib/api';

export default function SettingsPage() {
    const [resetLoading, setResetLoading] = useState(false);

    const handleResetDatabase = async () => {
        if (window.confirm('ARE YOU SURE? This will delete ALL events, venues, artists, and organizers! This cannot be undone.')) {
            try {
                setResetLoading(true);
                await resetDatabase();
                alert('Database cleared successfully');
                window.location.reload();
            } catch (e: any) {
                alert('Failed to reset DB: ' + e.message);
            } finally {
                setResetLoading(false);
            }
        }
    };

    return (
        <div className="p-8 max-w-5xl mx-auto h-full overflow-y-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Settings</h1>
                <p className="text-gray-500">Global system configuration and maintenance options.</p>
            </div>

            <div className="space-y-6">

                {/* Appearance Section */}
                <section className="bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-200 dark:border-gray-800 p-6">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                            <Layout className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Appearance</h3>
                            <p className="text-sm text-gray-500 mb-4">Manage the look and feel of the admin dashboard.</p>

                            <div className="flex items-center gap-4">
                                <Button variant="outline" size="sm">
                                    Toggle Dark Mode
                                </Button>
                                <span className="text-xs text-gray-400">(Uses system preference by default)</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Database Management Section */}
                <section className="bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-200 dark:border-gray-800 p-6">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-lg text-primary-600 dark:text-primary-400">
                            <Database className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Database & Maintenance</h3>
                            <p className="text-sm text-gray-500 mb-4">Cache management and data utilities.</p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                                    <h4 className="font-medium text-sm text-gray-900 dark:text-gray-200 mb-2 flex items-center gap-2">
                                        <RefreshCw className="w-4 h-4" /> Clear Cache
                                    </h4>
                                    <p className="text-xs text-gray-500 mb-3">Force reload of cached data in scraper service.</p>
                                    <Button variant="secondary" size="sm" disabled>Clear Service Cache</Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Danger Zone */}
                <section className="bg-red-50 dark:bg-red-900/10 rounded-xl shadow border border-red-200 dark:border-red-800/50 p-6">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400">
                            <AlertTriangle className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Danger Zone</h3>
                            <p className="text-sm text-gray-500 mb-4">Destructive actions that cannot be undone.</p>

                            <div className="p-4 bg-white dark:bg-gray-900 rounded-lg border border-red-100 dark:border-red-900/30 flex items-center justify-between">
                                <div>
                                    <h4 className="font-medium text-sm text-red-700 dark:text-red-400 mb-1">Reset Database</h4>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">
                                        This will permanently delete all scraped events, venues, artists, and organizers. System configurations (cities, sources, users) will remain.
                                    </p>
                                </div>
                                <Button
                                    variant="danger"
                                    onClick={handleResetDatabase}
                                    isLoading={resetLoading}
                                    leftIcon={<Trash2 className="w-4 h-4" />}
                                >
                                    Reset Entire Database
                                </Button>
                            </div>
                        </div>
                    </div>
                </section>

            </div>
        </div>
    );
}
