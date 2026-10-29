import { useMemo } from "react";

// "Complete your meal" suggestions (moved verbatim from Cart.jsx).
export default function useComplementaryItems({ cartItems, catalogueItems }) {
  // "Complete your meal" suggestions — picks complementary items from
  // the catalogue based on category-name keywords. Heuristic chosen over
  // a backend co-occurrence query so it works on day-1 tenants with no
  // order history. Buckets are name-based because every tenant labels
  // their categories differently — "Drinks" / "Beverages" / "Cold
  // Drinks" all map to the same intent.
  const complementaryItems = useMemo(() => {
    if (!catalogueItems?.length || !cartItems?.length) return [];

    const DRINKS = ['beverage', 'drink', 'water', 'juice', 'cold', 'hot ', 'tea', 'coffee', 'shake', 'cola', 'soda', 'mocktail', 'lassi'];
    const BREADS = ['bread', 'roti', 'naan', 'paratha', 'kulcha', 'chapati', 'puri', 'rumali'];
    const SIDES  = ['side', 'starter', 'appetizer', 'salad', 'fries', 'pakora', 'snack'];
    const SWEETS = ['dessert', 'sweet', 'cake', 'ice cream', 'pudding', 'gulab', 'jalebi', 'kulfi'];

    const matches = (catName, keywords) => {
      const n = String(catName || '').toLowerCase();
      return keywords.some(k => n.includes(k));
    };

    const cartItemIds = new Set(cartItems.map(it => it.id));
    const cartHasDrinks = cartItems.some(it => matches(it.category?.name, DRINKS));
    const cartHasBread  = cartItems.some(it => matches(it.category?.name, BREADS));
    const cartHasSide   = cartItems.some(it => matches(it.category?.name, SIDES));
    const cartHasSweet  = cartItems.some(it => matches(it.category?.name, SWEETS));
    // "Main" = anything that's NOT a drink/bread/side/sweet. If the
    // user added paneer masala, this triggers the bread + drink picks.
    const cartHasMain = cartItems.some(it => {
      const n = String(it.category?.name || '').toLowerCase();
      return n && !matches(n, DRINKS) && !matches(n, BREADS) && !matches(n, SIDES) && !matches(n, SWEETS);
    });

    const scored = catalogueItems
      .filter(m => !cartItemIds.has(m._id))
      .filter(m => m.status !== 'inactive' && m.status !== 'archived')
      .map(m => {
        const catName = m.category?.name || '';
        let score = 0;
        if (!cartHasDrinks && matches(catName, DRINKS)) score += 5;
        if (cartHasMain && !cartHasBread && matches(catName, BREADS)) score += 4;
        if (!cartHasSide && matches(catName, SIDES)) score += 2;
        if (!cartHasSweet && matches(catName, SWEETS)) score += 1;
        // Tiebreak: more-ordered items first (capped so blockbusters
        // don't drown out category diversity).
        score += Math.min(2, (m.orderCount || 0) / 10);
        return { item: m, score };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    // Pick top items but enforce at most 2 per category — keeps the
    // strip mixed (e.g. 1 water + 1 roti + 1 fries beats 3 sodas).
    const perCatCount = {};
    const out = [];
    for (const s of scored) {
      const cat = String(s.item.category?._id || s.item.category || 'none');
      if ((perCatCount[cat] || 0) >= 2) continue;
      perCatCount[cat] = (perCatCount[cat] || 0) + 1;
      out.push(s.item);
      if (out.length >= 6) break;
    }
    return out;
  }, [cartItems, catalogueItems]);
  return complementaryItems;
}
