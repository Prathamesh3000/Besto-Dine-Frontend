import React from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Navigation, Phone, Mail } from 'lucide-react';
import { externalUrl, telHref } from './landingUtils';

/** Full address with "Get directions" (map link) and "Call" buttons. */
const LocationCard = ({ address = {}, phone = '', email = '', mapUrl = '' }) => {
    const { t } = useTranslation();
    const full = address.full || [address.line1, address.line2, address.city, address.state, address.pincode, address.country]
        .map(p => String(p || '').trim()).filter(Boolean).join(', ');
    const directions = externalUrl(mapUrl || address.mapUrl)
        || (full ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full)}` : '');
    const tel = telHref(phone);

    return (
        <div className="space-y-3.5">
            {full && (
                <div className="flex items-start gap-2.5">
                    <MapPin size={16} className="text-[#98A2B3] shrink-0 mt-0.5" />
                    <p className="text-[14px] leading-[20px] text-[#344054] font-varela">{full}</p>
                </div>
            )}
            {email && (
                <a href={`mailto:${email}`} className="flex items-center gap-2.5 text-[14px] text-[#344054] font-varela hover:text-[var(--accent)]">
                    <Mail size={16} className="text-[#98A2B3] shrink-0" />
                    <span className="break-all">{email}</span>
                </a>
            )}
            {(directions || tel) && (
                <div className={`grid gap-2.5 ${directions && tel ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {directions && (
                        <a
                            href={directions}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold font-nunito bg-[var(--accent)] text-[var(--accent-fg)] active:scale-[0.98] transition-transform"
                        >
                            <Navigation size={15} strokeWidth={2.4} />
                            {t('restaurant_landing.get_directions', 'Get directions')}
                        </a>
                    )}
                    {tel && (
                        <a
                            href={tel}
                            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold font-nunito border border-[#E4E7EC] text-[#101828] bg-white active:scale-[0.98] transition-transform"
                        >
                            <Phone size={15} strokeWidth={2.4} />
                            {t('restaurant_landing.call', 'Call')}
                        </a>
                    )}
                </div>
            )}
        </div>
    );
};

export default LocationCard;
