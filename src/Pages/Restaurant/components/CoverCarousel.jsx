import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion as Motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { resolveImageUrl, sizedImage } from '../../../utils/image';

const AUTOPLAY_MS = 5000;

/**
 * Hero cover: cross-fading carousel of the restaurant's cover images
 * (swipe or tap the dots), or an accent gradient when there are none.
 * Autoplay is skipped for visitors who prefer reduced motion.
 */
const CoverCarousel = ({ images = [], alt = '' }) => {
    const { t } = useTranslation();
    const reduceMotion = useReducedMotion();
    const slides = images.map(resolveImageUrl).filter(Boolean);
    const [index, setIndex] = useState(0);
    const touchX = useRef(null);
    const count = slides.length;
    const current = count ? index % count : 0;

    useEffect(() => {
        if (count < 2 || reduceMotion) return undefined;
        const timer = setInterval(() => setIndex(i => (i + 1) % count), AUTOPLAY_MS);
        return () => clearInterval(timer);
    }, [count, reduceMotion, index]);

    const go = (delta) => setIndex(i => (i + delta + count) % count);

    if (!count) {
        return (
            <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 45%, #1A181B) 100%)' }}
                aria-hidden="true"
            >
                <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/10" />
                <div className="absolute -left-10 bottom-6 w-40 h-40 rounded-full bg-white/10" />
            </div>
        );
    }

    return (
        <div
            className="absolute inset-0"
            onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
            onTouchEnd={(e) => {
                if (touchX.current == null || count < 2) return;
                const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
                touchX.current = null;
                if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
            }}
        >
            <AnimatePresence initial={false}>
                <Motion.img
                    key={`${current}-${slides[current]}`}
                    src={sizedImage(slides[current], { w: 900, q: 75 })}
                    alt={alt}
                    loading={current === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    className="absolute inset-0 w-full h-full object-cover"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.6 }}
                />
            </AnimatePresence>
            {count > 1 && (
                <div className="absolute bottom-16 left-0 right-0 z-10 flex justify-center gap-1.5">
                    {slides.map((_, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => setIndex(i)}
                            aria-label={t('restaurant_landing.cover_slide', 'Show photo {{n}}', { n: i + 1 })}
                            aria-current={i === current}
                            className={`h-1.5 rounded-full transition-all ${i === current ? 'w-5 bg-white' : 'w-1.5 bg-white/60'}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default CoverCarousel;
