import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Copy, Check, SearchX, AlertTriangle, History, RefreshCcw, Lock } from 'lucide-react';
import { Card, SectionCard, Skeleton, Button, EmptyState } from '../components/ui';
import { actionLabel, fmtDateTime, fmtRelative, LIST_PATH } from './approvalUtils';

/**
 * Building blocks shared by the three Pending Approvals detail pages
 * (signup application, plan change, offline payment).
 */

export const PageShell = ({ children }) => (
    <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-360 mx-auto">{children}</div>
);

export const BackLink = ({ tab }) => (
    <Link
        to={tab ? `${LIST_PATH}?tab=${tab}` : LIST_PATH}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#FE8301] transition mb-5"
    >
        <ArrowLeft size={14} />
        Back to Pending Approvals
    </Link>
);

export const DetailSkeleton = () => (
    <>
        <Skeleton className="h-3 w-40 mb-6" />
        <Card className="p-5 sm:p-6 mb-5">
            <div className="flex items-center gap-4">
                <Skeleton className="w-14 h-14 rounded-2xl" />
                <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-2/5" />
                    <Skeleton className="h-3 w-1/4" />
                </div>
            </div>
        </Card>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
                {[1, 2, 3].map((i) => (
                    <Card key={i} className="p-6 space-y-3">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-3/4" />
                    </Card>
                ))}
            </div>
            <div className="space-y-5">
                {[1, 2].map((i) => (
                    <Card key={i} className="p-6 space-y-3">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-full" />
                    </Card>
                ))}
            </div>
        </div>
    </>
);

export const DetailError = ({ error, notFoundTitle, tab, onRetry }) => {
    const notFound = error?.status === 404 || error?.status === 400;
    return (
        <>
            <BackLink tab={tab} />
            <Card>
                <EmptyState
                    icon={notFound ? SearchX : AlertTriangle}
                    title={notFound ? notFoundTitle : 'Could not load this page'}
                    description={notFound
                        ? 'It may have been removed, or the link is wrong.'
                        : (error?.message || 'Something went wrong. Please try again.')}
                    action={notFound
                        ? <Link to={tab ? `${LIST_PATH}?tab=${tab}` : LIST_PATH} className="text-sm font-semibold text-[#FE8301] hover:underline">Back to Pending Approvals</Link>
                        : <Button variant="ghost" icon={RefreshCcw} onClick={onRetry}>Try again</Button>}
                />
            </Card>
        </>
    );
};

export const CopyButton = ({ value, label = 'Copy' }) => {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success('Copied');
            setTimeout(() => setCopied(false), 1500);
        } catch {
            toast.error('Could not copy');
        }
    };
    return (
        <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-[#FE8301]/40 hover:bg-orange-50 hover:text-[#FE8301] transition shrink-0"
            aria-label={`${label} ${value}`}
        >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : label}
        </button>
    );
};

/**
 * Sticky bottom action bar. Rendered last in the page so it pins to the
 * bottom of the viewport while the operator scrolls the details.
 */
export const StickyActionBar = ({ children, hint, readOnly }) => (
    <div className="sticky bottom-0 z-20 mt-6 -mx-4 sm:mx-0">
        <div className="bg-white/95 backdrop-blur border-t sm:border border-orange-100/80 sm:rounded-2xl shadow-[0_-6px_24px_rgba(17,24,39,0.08)] px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="text-xs text-gray-500 flex-1 min-w-0 flex items-center gap-1.5">
                {readOnly && <Lock size={12} className="shrink-0" />}
                <span className="truncate">{hint}</span>
            </div>
            {children && <div className="flex items-center gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">{children}</div>}
        </div>
    </div>
);

export const ActivityTimeline = ({ items = [] }) => (
    <SectionCard title="Activity" subtitle="Audit trail for this tenant, newest first." icon={History}>
        {items.length === 0 ? (
            <p className="text-xs text-gray-500">No recorded activity yet.</p>
        ) : (
            <ol className="relative border-l border-orange-100 ml-1.5 space-y-4">
                {items.map((a) => (
                    <li key={a._id} className="pl-4 relative">
                        <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#FE8301]/80 ring-4 ring-orange-50" />
                        <div className="text-sm font-semibold text-gray-900">{actionLabel(a.action)}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5" title={fmtDateTime(a.createdAt)}>
                            {a.actorName || 'Unknown'} · {fmtRelative(a.createdAt)}
                        </div>
                        {a.summary && (
                            <div className="text-xs text-gray-600 mt-1 break-words">{a.summary}</div>
                        )}
                    </li>
                ))}
            </ol>
        )}
    </SectionCard>
);

// Small label/value row used inside cards.
export const Row = ({ label, children }) => (
    <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-4 py-2.5 border-b border-gray-100 last:border-0">
        <div className="sm:w-40 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-gray-500 pt-0.5">{label}</div>
        <div className="flex-1 min-w-0 text-sm text-gray-900 break-words">{children ?? '—'}</div>
    </div>
);
