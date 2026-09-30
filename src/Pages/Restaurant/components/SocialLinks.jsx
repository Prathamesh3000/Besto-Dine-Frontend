import React from 'react';
import { useTranslation } from 'react-i18next';
import { Instagram, Facebook, Globe, MessageCircle } from 'lucide-react';
import { externalUrl, socialProfileUrl, whatsappUrl } from './landingUtils';

/** Build the visible social links; returns [] when the restaurant set none. */
function buildSocialLinks(social = {}, t) {
    return [
        { key: 'instagram', icon: Instagram, label: 'Instagram', href: socialProfileUrl(social.instagram, 'instagram.com') },
        { key: 'facebook', icon: Facebook, label: 'Facebook', href: socialProfileUrl(social.facebook, 'facebook.com') },
        { key: 'whatsapp', icon: MessageCircle, label: 'WhatsApp', href: whatsappUrl(social.whatsapp) },
        { key: 'website', icon: Globe, label: t('restaurant_landing.website', 'Website'), href: externalUrl(social.website) },
    ].filter(l => l.href);
}

/** Round icon buttons for Instagram / Facebook / WhatsApp / website. */
const SocialLinks = ({ social = {} }) => {
    const { t } = useTranslation();
    const links = buildSocialLinks(social, t);
    if (!links.length) return null;
    return (
        <div className="flex flex-wrap gap-2.5">
            {links.map(({ key, icon, label, href }) => { const Icon = icon; return (
                <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 pl-2 pr-3.5 py-2 rounded-full bg-white border border-[#E4E7EC] text-[13px] font-semibold text-[#344054] font-nunito hover:border-[color-mix(in_srgb,var(--accent)_40%,white)] hover:text-[var(--accent)] transition-colors"
                >
                    <span className="w-7 h-7 rounded-full flex items-center justify-center bg-[color-mix(in_srgb,var(--accent)_12%,white)] text-[var(--accent)]">
                        <Icon size={14} strokeWidth={2.2} />
                    </span>
                    {label}
                </a>
            ); })}
        </div>
    );
};

export default SocialLinks;
