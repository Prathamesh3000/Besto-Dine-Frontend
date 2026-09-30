// Smart image resolution for the kiosk surfaces.
import { sizedImage } from '../../utils/image';
//
// Backend menu items / categories may ship without imagery (fresh tenant,
// ingestion in progress, image pipeline skipped). A blanket "meals.png"
// fallback then plasters the same placeholder over an entire grid which
// looks broken. We map common category names to the kiosk's own
// pre-baked SVG/PNG chrome so each tile still has visual identity.

const GENERIC_ITEM = '/kiosk/images/meals.png';

// Category-name → kiosk asset map. Match is case-insensitive and
// substring-based (e.g. "Cold Beverages" resolves to beverages.png,
// "Rice & Biryani" resolves to meals.png).
const CATEGORY_MAP = [
    { keys: ['burger', 'wrap', 'sandwich', 'pizza'],        img: '/kiosk/images/Burger1.png' },
    { keys: ['taco', 'mexican', 'roll'],                    img: '/kiosk/images/tacos.png' },
    { keys: ['beverage', 'drink', 'juice', 'coffee', 'tea', 'shake', 'soda', 'water', 'lassi', 'smoothie'], img: '/kiosk/images/beverages.png' },
    { keys: ['dessert', 'sweet', 'cake', 'ice cream', 'pastry', 'mithai', 'kulfi'], img: '/kiosk/images/desserts.png' },
    { keys: ['side', 'fries', 'salad', 'starter', 'appet', 'soup', 'snack', 'chaat'], img: '/kiosk/images/sides.png' },
    // Broad Indian / main-course fallback — photos of biryani, thali,
    // curries, breads all land on the kiosk "meals" platter illustration.
    { keys: [
        'meal', 'combo', 'thali', 'breakfast', 'lunch', 'dinner', 'platter',
        'rice', 'biryani', 'curry', 'dal', 'paneer', 'chicken', 'mutton',
        'main', 'course', 'bread', 'roti', 'naan', 'paratha', 'kulcha',
        'noodle', 'pasta', 'chinese', 'indian', 'punjabi', 'south', 'north',
    ], img: '/kiosk/images/meals.png' },
];

// Rotating pool for "you might also like" recommendations — nicer than
// repeating the same generic category image five times.
const RECOMMENDATION_POOL = [
    '/kiosk/images/Egg-Cheesy-Roll.png',
    '/kiosk/images/Loaded-Nachos.png',
    '/kiosk/images/Korean-Spicy-Wings.png',
    '/kiosk/images/Classic-Fried-Chicken.png',
    '/kiosk/images/Egg-Bhurji.png',
];

function matchCategoryAsset(name) {
    if (!name || typeof name !== 'string') return null;
    const n = name.toLowerCase();
    for (const row of CATEGORY_MAP) {
        if (row.keys.some(k => n.includes(k))) return row.img;
    }
    return null;
}

// KIOSK-PERF — CDN-resized URLs for every menu/category image. Without
// this, kiosk grids were downloading 3-8 MB Unsplash photos (5000×3000 px)
// and rendering them at 110×110, blowing 80+ MB across a single page
// load and causing visible scroll jank on the touchscreen as the GPU
// re-uploaded 45-megapixel textures on every paint. sizedImage appends
// Unsplash/Cloudinary resize params so the host returns ~15-30 KB
// thumbnails instead.
//
// Sizes match the CSS box of each surface (CARD = 400px column tile,
// CHIP = 110px category pill). Bigger numbers waste bandwidth, smaller
// numbers blur on retina kiosk panels.
const CARD_OPTS = { w: 400, q: 70 };
const CHIP_OPTS = { w: 200, q: 70 };
const POPUP_OPTS = { w: 600, q: 75 };

/** Image URL for a category chip. Falls back to a kiosk asset by name. */
export function imageForCategory(category) {
    if (!category) return GENERIC_ITEM;
    if (category.image) return sizedImage(category.image, CHIP_OPTS);
    return matchCategoryAsset(category.name) || GENERIC_ITEM;
}

/**
 * Image URL for a menu item card. Uses the item's own image first; if
 * empty, falls back to the item's category's asset; finally to a generic
 * kiosk placeholder.
 */
export function imageForItem(item) {
    if (!item) return GENERIC_ITEM;
    if (item.image) return sizedImage(item.image, CARD_OPTS);
    const catName = item.category?.name || item.category;
    return matchCategoryAsset(typeof catName === 'string' ? catName : null) || GENERIC_ITEM;
}

/** Larger size for the ProductPopup hero image. */
export function imageForItemPopup(item) {
    if (!item) return GENERIC_ITEM;
    if (item.image) return sizedImage(item.image, POPUP_OPTS);
    const catName = item.category?.name || item.category;
    return matchCategoryAsset(typeof catName === 'string' ? catName : null) || GENERIC_ITEM;
}

/** Returns the Nth recommendation-pool image, cycling as needed. */
export function imageForRecommendation(item, index = 0) {
    if (item?.image) return sizedImage(item.image, CARD_OPTS);
    const catHit = matchCategoryAsset(item?.category?.name || item?.category);
    if (catHit) return catHit;
    return RECOMMENDATION_POOL[index % RECOMMENDATION_POOL.length];
}

export const KIOSK_GENERIC_ITEM_IMG = GENERIC_ITEM;
