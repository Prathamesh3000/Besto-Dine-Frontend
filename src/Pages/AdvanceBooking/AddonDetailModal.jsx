import React, { useState, useEffect } from 'react';
import Correct from "/correct.svg";
import { X, Check } from 'lucide-react';
import api from '../../utils/api';

const AddonDetailModal = ({ isOpen, onClose, onConfirm, type, data }) => {
    const [addonConfig, setAddonConfig] = useState(null);

    // Fetch addon detail config from backend when modal opens
    useEffect(() => {
        if (!isOpen || !type) return;
        // Use detailConfig from data prop if available (already fetched by parent)
        if (data?.detailConfig) {
            setAddonConfig(data.detailConfig);
            return;
        }
        // Otherwise try to fetch from addons API by slug/type
        api.get('/booking-info/addons', { _isBackground: true }).then(res => {
            if (res.data?.success) {
                const addon = res.data.addons?.find(a => a.slug === type || a.category === type);
                if (addon?.detailConfig) setAddonConfig(addon.detailConfig);
            }
        }).catch(() => {});
    }, [isOpen, type, data]);
    const [selectedOptions, setSelectedOptions] = useState([]);

    // Initialize state based on type when modal opens
    useEffect(() => {
        if (isOpen) {
            switch (type) {
                case 'photographer':
                case 'dj':
                    setSelectedOptions(['4']); // Default 4 hrs
                    break;
                case 'photobooth':
                    setSelectedOptions({ duration: '4', themes: data?.initialSelected || ['birthday', 'anniversary', 'floral'] });
                    break;
                case 'live':
                    setSelectedOptions(data?.initialSelected || ['pasta', 'chaat']);
                    break;
                case 'kids':
                    setSelectedOptions(data?.initialSelected || ['bouncy', 'face', 'art']);
                    break;
                case 'host':
                    setSelectedOptions(['4']);
                    break;
                default:
                    // Generic add-on default — start at quantity 1.
                    // Stored as a string in selectedOptions[0] so the
                    // existing handleSelect single-value path works.
                    setSelectedOptions(['1']);
            }
        }
    }, [isOpen, type, data]);

    if (!isOpen) return null;

    // Slugs handled with a single-select (one stored value). 'generic'
    // is the catch-all for any custom slug the admin invented — stores
    // the quantity as a string in selectedOptions[0].
    const SINGLE_SELECT_TYPES = new Set(['photographer', 'dj', 'host'])
    const isGeneric = !['photographer', 'dj', 'host', 'photobooth', 'live', 'kids'].includes(type)

    const handleSelect = (id) => {
        if (SINGLE_SELECT_TYPES.has(type) || isGeneric) {
            // Single select for duration / quantity
            setSelectedOptions([String(id)]);
        } else if (type === 'photobooth') {
            if (['2', '4', 'full'].includes(id)) {
                setSelectedOptions(prev => ({ ...prev, duration: id }));
            } else {
                setSelectedOptions(prev => {
                    const themes = prev.themes || [];
                    if (themes.includes(id)) {
                        return { ...prev, themes: themes.filter(item => item !== id) };
                    } else {
                        return { ...prev, themes: [...themes, id] };
                    }
                });
            }
        } else {
            // Multi select
            setSelectedOptions(prev => {
                const prevArray = Array.isArray(prev) ? prev : [];
                if (prevArray.includes(id)) {
                    return prevArray.filter(item => item !== id);
                } else {
                    return [...prevArray, id];
                }
            });
        }
    };

    const renderContent = () => {
        const cfg = addonConfig || {};
        const bp = data?.basePrice || 0;
        switch (type) {
            case 'photographer':
                return <PhotographyContent selected={selectedOptions[0]} onSelect={handleSelect} config={cfg} basePrice={bp} />;
            case 'dj':
                return <MusicContent selected={selectedOptions[0]} onSelect={handleSelect} config={cfg} basePrice={bp} />;
            case 'photobooth':
                return <PhotoBoothContent selected={selectedOptions} onSelect={handleSelect} config={cfg} basePrice={bp} />;
            case 'live':
                return <LiveFoodContent selected={selectedOptions} onSelect={handleSelect} config={cfg} basePrice={bp} />;
            case 'kids':
                return <KidsZoneContent selected={selectedOptions} onSelect={handleSelect} config={cfg} basePrice={bp} />;
            case 'host':
                return <HostContent selected={selectedOptions[0]} onSelect={handleSelect} config={cfg} basePrice={bp} />;
            default:
                // Generic fallback for any custom add-on the admin
                // creates with a non-standard slug (florist, magician,
                // balloon-arch, etc.). Renders the description + a
                // quantity stepper so the customer can pick how many
                // they want and the addon contributes price * qty.
                return (
                    <GenericAddonContent
                        quantity={Number(selectedOptions[0]) || 1}
                        onSelect={handleSelect}
                        description={data?.description || ''}
                        basePrice={bp}
                    />
                );
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="relative bg-[#FFFFFF] w-full max-w-md lg:max-w-2xl flex flex-col rounded-t-[24px] lg:rounded-[16px] animate-slideUpFull lg:animate-scaleIn max-h-[90vh] lg:max-h-[95vh] overflow-hidden shadow-2xl">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 w-[44px] h-[44px] bg-[#F7F7F7] rounded-full flex items-center justify-center shadow-sm hover:bg-gray-100 z-10"
                >
                    <X size={20} className="text-gray-600" />
                </button>
                <div className="relative w-full p-4 lg:p-6 flex flex-col flex-1 overflow-hidden">
                    <div className="bg-[#FFFFFF] w-full flex-1 rounded-[16px] relative overflow-hidden flex flex-col">
                        <div className="overflow-y-auto no-scrollbar flex-1 pb-24 lg:pb-0">
                            {renderContent()}
                        </div>

                        <div className="fixed bottom-0 left-0 right-0 lg:static bg-white lg:bg-transparent px-4 py-4 lg:px-0 lg:py-0 lg:mt-8 z-20 flex justify-end">
                            <button
                                onClick={() => onConfirm(selectedOptions)}
                                className="w-full lg:w-[160px] bg-[#FE8301] text-white font-nunito font-semibold text-[14px] lg:text-[16px] py-2 lg:py-3 px-4 rounded-[16px]"
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Sub-components for specific content

const fmtP = (v) => `₹${(v || 0).toLocaleString('en-IN')}`;
const getDurationPrices = (base) => ({
    '2': Math.round(base * 0.4),
    '4': Math.round(base * 0.8),
    'full': base,
});
const buildDurationOpts = (base) => {
    const p = getDurationPrices(base);
    return [
        { id: '2', label: '2 hrs', offer: fmtP(p['2']) },
        { id: '4', label: '4 hrs', offer: fmtP(p['4']) },
        { id: 'full', label: 'Full Event', offer: fmtP(p['full']) },
    ];
};

const PhotographyContent = ({ selected, onSelect, config = {}, basePrice = 0 }) => {
    const durationOptions = config.durationOptions || buildDurationOpts(basePrice);
    const dp = getDurationPrices(basePrice);
    const photosDelivered = config.deliverables || [
        '150–300 edited photos', '30 highlight shots same day', '3–5 min highlight reel',
        'Full ceremony recording', 'Soft cover – 30 pages', 'Premium hardbound – 50 pages'
    ];

    return (
        <>
            <Header title="Photography Coverage" subtitle="Best for small gatherings" icon={dataIcons.camera} />
            <div className="mb-6 lg:mb-8">
                <h3 className="text-[14px] lg:text-[18px] font-medium text-[#1A181B] mb-2 lg:mb-4 font-varela-round">Coverage Duration</h3>
                <div className="flex gap-2 lg:gap-4">
                    {durationOptions.map((opt) => (
                        <DurationOption key={opt.id} opt={opt} isSelected={selected === opt.id} onClick={() => onSelect(opt.id)} />
                    ))}
                </div>
            </div>
            <PriceInfo price={fmtP(dp[selected] || basePrice)} note="Extra hour charges apply" />
            <InfoBox title="Photographer Count" text="3 professionals" />
            <CheckList title="Photos Delivered" items={photosDelivered} columns={2} />
        </>
    );
};

const MusicContent = ({ selected, onSelect, config = {}, basePrice = 0 }) => {
    const durationOptions = config.durationOptions || buildDurationOpts(basePrice);
    const dp = getDurationPrices(basePrice);
    const equipment = config.equipment || ['Speakers & Mixer', 'Wireless Mic', 'Basic Lighting'];
    const addOns = config.addOns || ['Dance Floor Lights', 'Fog Machine', 'Live Percussionist'];

    return (
        <>
            <Header title="Music & DJ" subtitle="music & DJ Services" icon={dataIcons.music} />
            <div className="mb-6 lg:mb-8">
                <h3 className="text-[14px] lg:text-[18px] font-medium text-[#1A181B] mb-3 lg:mb-4 font-nunito">Duration</h3>
                <div className="flex gap-2 lg:gap-4">
                    {durationOptions.map((opt) => (
                        <DurationOption key={opt.id} opt={opt} isSelected={selected === opt.id} onClick={() => onSelect(opt.id)} />
                    ))}
                </div>
            </div>
            <PriceInfo price={fmtP(dp[selected] || basePrice)} note="Extra hour charges apply" />
            <InfoBox title="DJ Operator Count" text="2 professionals" />
            <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-8">
                <CheckList title="Equipment Included" items={equipment} />
                <CheckList title="Add-Ons" items={addOns} />
            </div>
        </>
    );
};

const PhotoBoothContent = ({ selected, onSelect, config = {}, basePrice = 0 }) => {
    const durationOptions = config.durationOptions || buildDurationOpts(basePrice);
    const dp = getDurationPrices(basePrice);

    const themeOptions = config.themeOptions || [
        { id: 'birthday', label: 'Birthday Theme' },
        { id: 'anniversary', label: 'Anniversary Theme' },
        { id: 'kids_party', label: 'Kids Party Theme' },
        { id: 'floral', label: 'Floral / Elegant Theme' },
    ];

    const inclusions = config.inclusions || [
        'Professional photo booth setup',
        'High-quality camera',
        'Ring light for perfect lighting',
        'Instant digital photo sharing',
        'QR download link',
        'On-site support staff (optional)'
    ];

    const currentDuration = selected.duration || '4';
    const currentThemes = selected.themes || [];

    return (
        <>
            <Header title="Photo Booth" subtitle="Capture the Moments That Matter" icon={dataIcons.photobooth} />
            <div className="mb-6 lg:mb-8">
                <h3 className="text-[14px] lg:text-[18px] font-medium text-[#1A181B] mb-2 lg:mb-4 font-varela-round">Duration</h3>
                <div className="flex gap-2 lg:gap-4">
                    {durationOptions.map((opt) => (
                        <DurationOption key={opt.id} opt={opt} isSelected={currentDuration === opt.id} onClick={() => onSelect(opt.id)} />
                    ))}
                </div>
            </div>
            <div className="lg:bg-[#FFFFFF] lg:p-4 lg:rounded-[16px] lg:border lg:border-[#F6F6F6] lg:shadow-[0px_4px_8.4px_0px_#D0C9F833] lg:mb-4 mb-4">
                <div className="bg-white rounded-[16px] p-4 lg:p-0 mb-0 lg:mb-0 shadow-sm lg:shadow-none border border-gray-100 lg:border-none">
                    <h3 className="text-[14px] lg:text-[20px] font-medium text-[#1A181B] mb-1 font-nunito">Theme Option</h3>
                    <p className="text-[#8D848F] text-[12px] lg:text-[14px] font-varela-round mb-4 lg:mb-2 border-b border-[#F2F2F2] lg:border-none pb-2 lg:pb-0">Choose any one</p>
                    <div className="space-y-4 pt-1 lg:pt-2 lg:border-t lg:border-[#F2F2F2]">
                        {themeOptions.map((opt) => (
                            <RadioOption key={opt.id} label={opt.label} isChecked={currentThemes.includes(opt.id)} onClick={() => onSelect(opt.id)} />
                        ))}
                    </div>
                </div>
            </div>
            <PriceInfo price={fmtP(dp[currentDuration] || basePrice)} note="Extra hour charges apply" />
            <CheckList title="What You Get" items={inclusions} />
        </>
    );
};

const LiveFoodContent = ({ selected, onSelect, config = {}, basePrice = 0 }) => {
    const counterTypes = config.counterTypes || [
        { id: 'pasta', label: 'Pasta' }, { id: 'chaat', label: 'Chaat' },
        { id: 'barbecue', label: 'Barbecue' }, { id: 'dosa', label: 'Dosa' },
        { id: 'mocktail', label: 'Mocktail bar' },
    ];

    return (
        <>
            <Header title="Live Food Station" subtitle="Freshly, Prepared right in front of your guests." icon={dataIcons.fcounter} />
            <div className="lg:bg-[#FFFFFF] lg:p-4 lg:rounded-[16px] lg:border lg:border-[#F6F6F6] lg:shadow-[0px_4px_8.4px_0px_#D0C9F833] lg:mb-8">
                <div className="bg-white rounded-[16px] p-4 lg:p-0 mb-0 lg:mb-0 shadow-sm lg:shadow-none border border-gray-100 lg:border-none">
                    <h3 className="text-[14px] lg:text-[20px] font-medium text-[#1A181B] mb-2 font-nunito">Counter Types</h3>
                    <p className="text-[#8D848F] text-[12px] lg:text-[14px] lg:pb-2 font-varela-round mb-4 lg:mb-2">Choose any counters</p>
                    <div className="space-y-4">
                        {counterTypes.map((opt) => (
                            <RadioOption key={opt.id} label={opt.label} isChecked={selected.includes(opt.id)} onClick={() => onSelect(opt.id)} hasGreenDot />
                        ))}
                    </div>
                </div>
            </div>
            <PriceInfo price={fmtP(basePrice)} note="Extra hour charges apply" />
            <InfoBox title="Chef Count" text="3 Per Counter" />
            <CheckList title="Servings Capacity" items={['Up to 80-120 guests per counter', 'Time Active 2-3 hrs']} />
        </>
    );
};

const KidsZoneContent = ({ selected, onSelect, config = {}, basePrice = 0 }) => {
    const activityOptions = config.activityOptions || [
        { id: 'bouncy', label: 'Bouncy Castle' }, { id: 'face', label: 'Face Painting' },
        { id: 'games', label: 'Mini Games' }, { id: 'art', label: 'Art & Craft' },
        { id: 'mocktail', label: 'Mocktail bar' },
    ];

    return (
        <>
            <Header title="Kids Entertainment Zone" subtitle="Safe fun for little guests." icon={dataIcons.kids} />
            <div className="lg:bg-[#FFFFFF] lg:p-4 lg:rounded-[16px] lg:border lg:border-[#F6F6F6] lg:shadow-[0px_4px_8.4px_0px_#D0C9F833] lg:mb-4">
                <div className="bg-white rounded-[16px] p-4 lg:p-0 mb-0 lg:mb-0 shadow-sm lg:shadow-none border border-gray-100 lg:border-none">
                    <h3 className="text-[14px] lg:text-[20px] font-medium text-[#1A181B] mb-2 font-varela-round">Activities</h3>
                    <p className="text-[#8D848F] text-[12px] lg:text-[16px] font-varela-round mb-4">Choose any little counters</p>
                    <div className="space-y-4">
                        {activityOptions.map((opt) => (
                            <RadioOption key={opt.id} label={opt.label} isChecked={selected.includes(opt.id)} onClick={() => onSelect(opt.id)} />
                        ))}
                    </div>
                </div>
            </div>
            <PriceInfo price={fmtP(basePrice)} note="Extra hour charges apply" />
            <InfoBox title="Supervision" text="1 caretaker per 10 kids" />
            <CheckList title="Safety" items={['Sanitized Equipment', 'Soft Flooring', 'First-aid kit']} />
        </>
    );
};

const HostContent = ({ selected, onSelect, config = {}, basePrice = 0 }) => {
    const durationOptions = config.durationOptions || buildDurationOpts(basePrice);
    const dp = getDurationPrices(basePrice);
    const roleItems = config.roleItems || [
        'Guest engagement', 'Announcements',
        'Games & activities', 'Schedule management'
    ];

    return (
        <>
            <Header title="Professional Event Host" subtitle="Professional Event Host" icon={dataIcons.host} />
            <div className="mb-6 lg:mb-4">
                <h3 className="text-[14px] lg:text-[18px] font-medium text-[#1A181B] mb-3 lg:mb-4 font-nunito">Coverage Duration</h3>
                <div className="flex gap-2 lg:gap-4">
                    {durationOptions.map((opt) => (
                        <DurationOption key={opt.id} opt={opt} isSelected={selected === opt.id} onClick={() => onSelect(opt.id)} />
                    ))}
                </div>
            </div>
            <PriceInfo price={fmtP(dp[selected] || basePrice)} note="Extra hour charges apply" />
            <InfoBox title="Host Count" text="1 professional" />
            <CheckList title="Role" items={roleItems} />
        </>
    );
};

// Reusable UI Components

const Header = ({ title, subtitle, icon }) => (
    <>
        <div className="flex  flex-col gap-4 lg:gap-4 mb-2 lg:mb-2">
            <div className="w-[30px] h-[30px] lg:w-[45px] lg:h-[39px]">
                <img src={icon} alt={title} className="w-full h-full object-contain" />
            </div>
            <h2 className="text-[18px] lg:text-[24px] font-semibold font-nunito text-[#1A181B]">{title}</h2>
        </div>
        <p className="text-[#8D848F] text-[14px] lg:text-[16px] font-varela-round mb-4 lg:mb-5">{subtitle}</p>
    </>
);

const PriceInfo = ({ price, note }) => (
    <div className="mb-4 lg:mb-6">
        <div className="flex items-baseline gap-1 lg:gap-1">
            <span className="text-[16px] lg:text-[20px] font-semibold font-nunito text-[#1A181B]">{price}</span>
            <span className="text-[12px] lg:text-[16px]  font-semibold font-nunito text-[#1A181B]">base price</span>
        </div>
        <p className="text-[#007AFF] text-[12px] lg:text-[14px] font-varela-round">{note}</p>
    </div>
);

const InfoBox = ({ title, text }) => (
    <div className="bg-[#FDF5FF] lg:bg-[#FDF5FF] rounded-[11px] p-2 lg:p-3 mb-4 lg:mb-6">
        <h3 className="text-[14px] lg:text-[16px] font-regular text-[#333333] mb-0 font-varela-round">{title}</h3>
        <p className="text-[#8D848F] lg:text-[16px] font-varela-round">{text}</p>
    </div>
);

const CheckList = ({ title, items, columns = 1 }) => (
    <div className="mb-6 lg:mb-3">
        <h3 className="text-[16px] lg:text-[20px] font-semibold text-[#1A181B] mb-2 lg:mb-2 font-nunito">{title}</h3>
        <div className={`grid ${columns === 2 ? 'grid-cols-2 lg:grid-cols-2' : 'grid-cols-1'} gap-x-8 gap-y-2 lg:gap-y-4`}>
            {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-1">
                    <img
                        src={Correct}
                        alt="check"
                        className="w-4 h-4 lg:w-5 lg:h-5 mt-0.5  shrink-0"
                    />
                    <span className="text-[#645E66] text-[12px] lg:text-[16px]  font-varela-round">{item}</span>
                </div>
            ))}
        </div>
    </div>
);

const DurationOption = ({ opt, isSelected, onClick }) => (
    <button
        onClick={onClick}
        className={`flex-1 py-2 lg:py-4 px-3 lg:px-6 rounded-[10px] border flex flex-col items-center justify-center transition-all
        ${isSelected ? 'bg-[#FFFAF5] border-[#FF9B0B] shadow-sm' : 'bg-white border-[#EEEEEE]'}`}
    >
        <span className="text-[14px] lg:text-[16px]  lg:font-medium font-varela-round text-[#1A181B]">{opt.label}</span>
        <span className="text-[12px] lg:text-[14px] font-varela-round text-[#007AFF]">{opt.offer}</span>
    </button>
);

const RadioOption = ({ label, isChecked, onClick, hasGreenDot }) => (
    <div className="flex items-center justify-between cursor-pointer py-1" onClick={onClick}>
        <div className="flex items-center gap-2 lg:gap-4">
            {hasGreenDot && (
                <div className="w-5 h-4 lg:w-6 lg:h-6 border border-green-500 flex items-center justify-center rounded-[4px] p-0.5">
                    <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
                </div>
            )}
            <span className="text-[14px] lg:text-[16px] font-varela-round text-[#1A181B]">{label}</span>
        </div>
        <div className={`w-5 h-5 lg:w-6 lg:h-6 rounded-[4px] lg:rounded-[6px] flex items-center justify-center border transition-all ${isChecked ? 'bg-[#FE8301] border-[#FE8301]' : 'border-gray-300'}`}>
            {isChecked && <Check size={14} className="text-white" strokeWidth={3} />}
        </div>
    </div>
);

import CameraImg from "/camera.svg";
import MusicImg from "/music.svg";
import PhotoBoothImg from "/photobooth.png";
import FcounterImg from "/fcounter.svg";
import KidsImg from "/kids.svg";
import Mike from "/mike.svg";

const dataIcons = {
    camera: CameraImg,
    music: MusicImg,
    photobooth: PhotoBoothImg,
    fcounter: FcounterImg,
    kids: KidsImg,
    host: Mike
};

/**
 * GenericAddonContent — fallback configurator for any custom add-on
 * the admin invents (slug not in the standard six). Shows the add-on
 * description + a quantity stepper bound to selectedOptions[0]. Final
 * price for the booking is basePrice × quantity, computed by the
 * parent confirm flow when it sums everything up.
 */
const GenericAddonContent = ({ quantity, onSelect, description, basePrice }) => {
    const qty = Math.max(1, Number(quantity) || 1);
    const subtotal = (Number(basePrice) || 0) * qty;
    return (
        <div className="space-y-5 lg:space-y-6">
            {description && (
                <p className="text-[14px] lg:text-[15px] text-[#645E66] leading-relaxed">{description}</p>
            )}

            <div className="bg-[#FAFBFC] border border-gray-200 rounded-[14px] p-4 lg:p-5">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="text-[13px] font-varela text-[#645E66]">Quantity</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">How many of this add-on do you need?</div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => onSelect(Math.max(1, qty - 1))}
                            disabled={qty <= 1}
                            aria-label="Decrease quantity"
                            className="w-9 h-9 lg:w-10 lg:h-10 rounded-full border border-gray-300 text-gray-600 font-bold text-[18px] flex items-center justify-center hover:border-[#FE8301] hover:text-[#FE8301] disabled:opacity-40 disabled:cursor-not-allowed transition"
                        >−</button>
                        <span className="min-w-[28px] text-center text-[16px] lg:text-[17px] font-bold text-[#1A181B] tabular-nums">{qty}</span>
                        <button
                            type="button"
                            onClick={() => onSelect(qty + 1)}
                            aria-label="Increase quantity"
                            className="w-9 h-9 lg:w-10 lg:h-10 rounded-full border border-gray-300 text-gray-600 font-bold text-[18px] flex items-center justify-center hover:border-[#FE8301] hover:text-[#FE8301] transition"
                        >+</button>
                    </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                    <div className="text-[13px] font-varela text-[#645E66]">
                        ₹{(Number(basePrice) || 0).toLocaleString('en-IN')} <span className="text-gray-400">× {qty}</span>
                    </div>
                    <div className="text-[16px] lg:text-[18px] font-bold text-[#FE8301]">
                        ₹{subtotal.toLocaleString('en-IN')}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AddonDetailModal;

