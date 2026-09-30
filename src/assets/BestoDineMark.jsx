import React from 'react';

/**
 * The BestoDine "B" monogram.
 *
 * The staff login page rendered a generic lucide <Coffee /> icon as its
 * brand mark — reported as "BestoDine logo is not present in login page
 * of staff". The mark did exist, but only as public/favicon.svg, and
 * nothing in the app referenced it. This component makes it usable
 * anywhere in the UI rather than only in the browser tab.
 *
 * The path is the favicon's, unchanged, so the tab icon and the in-app
 * mark cannot drift apart.
 *
 * `currentColor` by default so the mark inherits its surrounding text
 * colour — it sits on a dark hero panel in one place and a white card
 * in another, and duplicating the SVG per background would guarantee
 * the two eventually diverge.
 */
export default function BestoDineMark({ className = '', color = 'currentColor', title = 'BestoDine' }) {
    return (
        <svg
            viewBox="0 0 64 64"
            className={className}
            role="img"
            aria-label={title}
            xmlns="http://www.w3.org/2000/svg"
        >
            <title>{title}</title>
            <path
                fill={color}
                fillRule="evenodd"
                d="M16 9 H35 C43 9 48 14 48 22 C48 27.5 45 31 40 32.2 C45.5 33.4 50 37.5 50 43.5 C50 51 44.5 56 36 56 H16 Z M25 17 V28 H34 C38.5 28 41 25.8 41 22.5 C41 19.2 38.5 17 34 17 Z M25 36 H40 C44 36 46 39 43 43 L25 50 Z"
            />
        </svg>
    );
}
