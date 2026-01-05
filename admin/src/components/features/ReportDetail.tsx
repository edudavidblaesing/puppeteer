import React, { useState } from 'react';
import { FormLayout } from '@/components/ui/FormLayout';
import { FormSection } from '@/components/ui/FormSection';
import { Button } from '@/components/ui/Button';
import { Shield, User, MessageSquare, AlertTriangle, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { resolveReport, deleteReportedContent } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import clsx from 'clsx';

interface ReportDetailProps {
    report: any; // Using any for now as types might need update
    onClose: () => void;
    onUpdate: () => void;
    isPanel?: boolean;
}

export function ReportDetail({ report, onClose, onUpdate, isPanel = false }: ReportDetailProps) {
    const { success, error } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);
    const [adminNotes, setAdminNotes] = useState(report.admin_notes || '');

    const handleResolve = async (status: 'resolved' | 'dismissed') => {
        try {
            setIsProcessing(true);
            await resolveReport(report.id, status, adminNotes);
            success(`Report marked as ${status}`);
            onUpdate();
            onClose();
        } catch (e: any) {
            error(e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeleteContent = async () => {
        if (!confirm('Are you sure you want to delete the reported content? This cannot be undone.')) return;
        try {
            setIsProcessing(true);
            await deleteReportedContent(report.id, true);
            success('Content deleted and report resolved');
            onUpdate();
            onClose();
        } catch (e: any) {
            error(e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const contentPreview = () => {
        if (report.content_type === 'comment') {
            return (
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 font-mono text-sm">
                    "{report.content_id}" (Content preview unavailable in API currently)
                </div>
            );
        }
        return <div className="text-gray-500 italic">Content ID: {report.content_id}</div>;
    };

    return (
        <FormLayout
            title={`Report #${report.id.substring(0, 8)}`}
            isPanel={isPanel}
            onCancel={() => onClose()}
            saveLabel="" // Hide default save
            isLoading={isProcessing}
        >
            {/* status banner */}
            <div className={clsx(
                "px-4 py-3 mb-4 rounded-lg flex items-center gap-2",
                report.status === 'pending' ? "bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200" :
                    report.status === 'resolved' ? "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200" :
                        "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
            )}>
                {report.status === 'pending' ? <AlertTriangle className="w-5 h-5" /> :
                    report.status === 'resolved' ? <CheckCircle className="w-5 h-5" /> :
                        <XCircle className="w-5 h-5" />}
                <span className="font-semibold uppercase text-sm">{report.status}</span>
            </div>

            <FormSection title="Report Details" icon={<Shield className="w-4 h-4" />}>
                <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase">Reporter</label>
                            <div className="flex items-center gap-2 mt-1">
                                <User className="w-4 h-4 text-gray-400" />
                                <span>{report.reporter_name || 'Unknown'}</span>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase">Reason</label>
                            <div className="mt-1 font-medium text-red-600 dark:text-red-400">{report.reason}</div>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Description</label>
                        <p className="mt-1 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 p-3 rounded border border-gray-100 dark:border-gray-800">
                            {report.description || 'No description provided.'}
                        </p>
                    </div>
                </div>
            </FormSection>

            <FormSection title="Reported Content" icon={<MessageSquare className="w-4 h-4" />}>
                <div className="pt-2">
                    <div className="mb-2 text-sm text-gray-500">
                        Type: <span className="font-semibold text-gray-900 dark:text-gray-100 uppercase">{report.content_type}</span>
                    </div>
                    {contentPreview()}
                </div>
            </FormSection>

            <FormSection title="Resolution" icon={<CheckCircle className="w-4 h-4" />}>
                <div className="pt-2 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Admin Notes</label>
                        <textarea
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-800 dark:border-gray-700 sm:text-sm"
                            rows={3}
                            value={adminNotes}
                            onChange={e => setAdminNotes(e.target.value)}
                            placeholder="Add notes about the resolution..."
                        />
                    </div>

                    {report.status === 'pending' && (
                        <div className="flex flex-col gap-3 pt-2">
                            <div className="flex gap-3">
                                <Button onClick={() => handleResolve('resolved')} className="flex-1 bg-green-600 hover:bg-green-700">
                                    Keep Content & Resolve
                                </Button>
                                <Button onClick={() => handleResolve('dismissed')} variant="secondary" className="flex-1">
                                    Dismiss Report
                                </Button>
                            </div>
                            <div className="border-t border-gray-200 dark:border-gray-800 pt-3 mt-1">
                                <Button onClick={handleDeleteContent} variant="danger" className="w-full justify-center">
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete Content & Resolve
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </FormSection>
        </FormLayout>
    );
}
