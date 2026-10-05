import React, { useRef } from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { toast } from 'react-hot-toast';
import { Copy, ExternalLink, Download } from 'lucide-react';
import { isLoopbackOrigin } from '../../utils/customerLinks';

/**
 * ShareLinkPanel — a customer entry link with Copy / Open actions and a
 * downloadable QR code (posters, table tents, Instagram bio, Google Maps
 * listing). Styling is self-contained so it drops into both the Super
 * Admin and tenant Admin surfaces.
 */
const ShareLinkPanel = ({ url, qrFileName = 'restaurant-qr', note = null }) => {
    const qrCanvasWrapRef = useRef(null);
    if (!url) return null;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            toast.success('Link copied');
        } catch {
            toast.error('Could not copy — select the link and copy it manually');
        }
    };

    const handleDownloadQr = () => {
        const canvas = qrCanvasWrapRef.current?.querySelector('canvas');
        if (!canvas) return;
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `${qrFileName}.png`;
        a.click();
    };

    const secondaryBtn = 'inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-white text-gray-700 border border-gray-200 hover:border-[#FE8301]/40 hover:bg-orange-50 hover:text-[#FE8301] transition';

    return (
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
            <div className="shrink-0 self-start p-2 bg-white border border-gray-200 rounded-xl">
                <QRCodeSVG value={url} size={104} level="M" />
            </div>
            {/* High-res copy used only for the PNG download — a printed
                poster needs far more pixels than the on-screen preview. */}
            <div ref={qrCanvasWrapRef} className="hidden" aria-hidden="true">
                <QRCodeCanvas value={url} size={1024} level="M" marginSize={4} />
            </div>

            <div className="flex-1 min-w-0 space-y-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 font-mono text-xs text-gray-900 break-all">
                    {url}
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#FE8301] text-white hover:bg-[#e57601] transition"
                    >
                        <Copy size={13} />
                        Copy link
                    </button>
                    <a href={url} target="_blank" rel="noopener noreferrer" className={secondaryBtn}>
                        <ExternalLink size={13} />
                        Open
                    </a>
                    <button type="button" onClick={handleDownloadQr} className={secondaryBtn}>
                        <Download size={13} />
                        Download QR
                    </button>
                </div>
                {note && <p className="text-xs text-gray-500 leading-relaxed">{note}</p>}
                {isLoopbackOrigin(url) && (
                    <p role="alert" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 leading-relaxed">
                        This link points to localhost — phones and other devices can't open it. Open the admin using your
                        computer's network address (e.g. http://192.168.x.x:5173) or set VITE_PUBLIC_APP_URL.
                    </p>
                )}
            </div>
        </div>
    );
};

export default ShareLinkPanel;
