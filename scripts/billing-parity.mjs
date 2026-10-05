#!/usr/bin/env node
/**
 * billing-parity — asserts that the frontend bill maths
 * (Frontend/src/utils/billing.js) produces exactly what the server's
 * source of truth (Backend/utils/billing.js) produces.
 *
 * The server re-prices every order with its own computeBill; any
 * disagreement means a screen shows the customer a number the server
 * will not charge. Run after touching either file:
 *
 *     node scripts/billing-parity.mjs
 *
 * No test framework — plain node:assert. Exits non-zero on the first
 * mismatch batch.
 */
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, '..');
const repoRoot = path.resolve(frontendRoot, '..');

// The frontend source uses Vite-style extensionless relative imports
// ('./pricing'). Teach Node's ESM resolver to retry with '.js' so the
// real module is imported unmodified.
registerHooks({
    resolve(specifier, context, nextResolve) {
        try {
            return nextResolve(specifier, context);
        } catch (err) {
            if (specifier.startsWith('.') && !path.extname(specifier)) {
                return nextResolve(`${specifier}.js`, context);
            }
            throw err;
        }
    },
});

const require = createRequire(import.meta.url);
const backend = require(path.join(repoRoot, 'Backend', 'utils', 'billing.js'));
const frontend = await import(pathToFileURL(path.join(frontendRoot, 'src', 'utils', 'billing.js')).href);

// ── Fixtures ────────────────────────────────────────────────────────────
const settings = {
    none: null,
    gstOnly: { gst: { enabled: true, value: 5 }, serviceCharge: { enabled: false, value: 10 } },
    gstAndService: { gst: { enabled: true, value: 18 }, serviceCharge: { enabled: true, value: 10 } },
    oddRates: { gst: { enabled: true, value: 2.5 }, serviceCharge: { enabled: true, value: 7.5 } },
    stringRates: { gst: { enabled: true, value: '12' }, serviceCharge: { enabled: true, value: '5' } },
    disabledAll: { gst: { enabled: false, value: 18 }, serviceCharge: { enabled: false, value: 10 } },
    withCharges: {
        gst: { enabled: true, value: 5 },
        serviceCharge: { enabled: true, value: 10 },
        additionalCharges: [
            { name: 'Packaging', type: 'Flat', value: 16, enabled: true },
            { name: 'Cess', type: 'Percentage', value: 1.5, enabled: true },
            { name: 'Disabled', type: 'Flat', value: 99, enabled: false },
            { name: 'NoFlag', type: 'Flat', value: 3.333 },
            { name: 'Zero', type: 'Percentage', value: 0, enabled: true },
        ],
    },
};

const ORDER_TYPES = ['dine-in', 'DineIn', 'dine_in', 'takeaway', 'Take Away', 'pickup',
    'delivery', 'home-delivery', 'kiosk', '', undefined, 'something-else'];

const cases = [];
const add = (name, input) => cases.push({ name, input });

// Channel × service-charge on/off × settings shapes.
for (const [sName, taxes] of Object.entries(settings)) {
    for (const orderType of ORDER_TYPES) {
        add(`${sName} / ${String(orderType)}`, {
            subtotal: 437.5,
            taxConfig: backend.toTaxConfig(taxes),
            orderType,
        });
    }
}

// Coupons, points, tip, delivery — including over-large discounts that
// must clamp the total to 0, and ordering (tax on gross, then discounts).
const cfg = backend.toTaxConfig(settings.withCharges);
add('coupon', { subtotal: 500, taxConfig: cfg, orderType: 'dine-in', couponDiscount: 50 });
add('points', { subtotal: 500, taxConfig: cfg, orderType: 'takeaway', pointsRedeemed: 30 });
add('coupon+points+tip', { subtotal: 812.4, taxConfig: cfg, orderType: 'dine-in', couponDiscount: 100, pointsRedeemed: 25.5, tipAmount: 20 });
add('delivery fee', { subtotal: 260, taxConfig: cfg, orderType: 'delivery', deliveryFee: 40, couponDiscount: 10 });
add('discount exceeds bill → 0', { subtotal: 100, taxConfig: cfg, orderType: 'dine-in', couponDiscount: 500 });
add('string numerics', { subtotal: '199.99', taxConfig: cfg, orderType: 'kiosk', couponDiscount: '10', tipAmount: '5' });
add('garbage numerics', { subtotal: 'abc', taxConfig: cfg, orderType: 'dine-in', couponDiscount: NaN, tipAmount: null });
add('empty cart: no flat charges', { subtotal: 0, taxConfig: cfg, orderType: 'dine-in' });
add('negative subtotal', { subtotal: -20, taxConfig: cfg, orderType: 'dine-in' });
add('no args', undefined);
add('empty taxConfig', { subtotal: 120, taxConfig: {}, orderType: 'dine-in' });

// Rounding edge cases: half-paisa values and float dust.
for (const subtotal of [0.005, 0.015, 1.005, 1.115, 10.005, 40.5, 99.995, 100.045, 0.1 + 0.2, 333.335, 1234.565]) {
    add(`rounding ${subtotal}`, { subtotal, taxConfig: backend.toTaxConfig(settings.oddRates), orderType: 'dine-in' });
    add(`rounding ${subtotal} + charges`, { subtotal, taxConfig: cfg, orderType: 'takeaway', couponDiscount: 0.005, tipAmount: 0.005 });
}

// Deterministic sweep (LCG) over many subtotal / rate combinations.
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
for (let i = 0; i < 2000; i++) {
    const taxes = {
        gst: { enabled: rnd() > 0.2, value: Math.round(rnd() * 2800) / 100 },
        serviceCharge: { enabled: rnd() > 0.4, value: Math.round(rnd() * 2000) / 100 },
        additionalCharges: rnd() > 0.5
            ? [{ name: 'X', type: rnd() > 0.5 ? 'Flat' : 'Percentage', value: Math.round(rnd() * 5000) / 100, enabled: true }]
            : [],
    };
    add(`sweep #${i}`, {
        subtotal: Math.round(rnd() * 500000) / 1000,
        taxConfig: backend.toTaxConfig(taxes),
        orderType: ORDER_TYPES[Math.floor(rnd() * ORDER_TYPES.length)],
        couponDiscount: rnd() > 0.7 ? Math.round(rnd() * 20000) / 100 : 0,
        pointsRedeemed: rnd() > 0.8 ? Math.round(rnd() * 10000) / 100 : 0,
        tipAmount: rnd() > 0.8 ? Math.round(rnd() * 5000) / 100 : 0,
        deliveryFee: rnd() > 0.8 ? Math.round(rnd() * 8000) / 100 : 0,
    });
}

// ── Assertions ──────────────────────────────────────────────────────────
const failures = [];
const check = (name, fn) => {
    try { fn(); } catch (err) { failures.push(`${name}: ${err.message}`); }
};

// 1. computeBill — every field the server returns must match exactly.
for (const { name, input } of cases) {
    check(`computeBill ${name}`, () => {
        const b = backend.computeBill(input);
        const f = frontend.computeBill(input);
        for (const key of Object.keys(b)) {
            assert.deepStrictEqual(f[key], b[key], `field "${key}" differs (frontend ${JSON.stringify(f[key])} vs backend ${JSON.stringify(b[key])})`);
        }
    });
}

// 2. toTaxConfig — same flattening of Settings.taxes.
for (const [sName, taxes] of Object.entries(settings)) {
    check(`toTaxConfig ${sName}`, () => {
        assert.deepStrictEqual(frontend.toTaxConfig(taxes), backend.toTaxConfig(taxes));
    });
}

// 3. normaliseOrderType + service-charge policy.
for (const t of ORDER_TYPES) {
    check(`normaliseOrderType ${String(t)}`, () => {
        assert.equal(frontend.normaliseOrderType(t), backend.normaliseOrderType(t));
    });
}
check('SERVICE_CHARGE_TYPES', () => {
    assert.deepStrictEqual([...frontend.SERVICE_CHARGE_TYPES].sort(), [...backend.SERVICE_CHARGE_TYPES].sort());
});

// 4. Policy spot checks — the rules the module exists for.
check('takeaway/delivery/kiosk get no service charge', () => {
    for (const orderType of ['takeaway', 'delivery', 'kiosk']) {
        const f = frontend.computeBill({ subtotal: 100, taxConfig: { gstPct: 5, servicePct: 10 }, orderType });
        assert.equal(f.serviceCharge, 0, orderType);
        assert.equal(f.total, 105, orderType);
    }
    assert.equal(frontend.computeBill({ subtotal: 100, taxConfig: { gstPct: 5, servicePct: 10 }, orderType: 'dine-in' }).total, 115);
});
check('GST on the post-coupon value (subtotal − coupon)', () => {
    // 5% of (200 − 100) = 5; 200 + 5 − 100 = 105
    const f = frontend.computeBill({ subtotal: 200, taxConfig: { gstPct: 5 }, orderType: 'takeaway', couponDiscount: 100 });
    assert.equal(f.gst, 5);
    assert.equal(f.total, 105);
    // ₹1000 food, 5% GST, ₹100 coupon → GST ₹45, total ₹945
    const g = frontend.computeBill({ subtotal: 1000, taxConfig: { gstPct: 5 }, orderType: 'takeaway', couponDiscount: 100 });
    assert.equal(g.gst, 45);
    assert.equal(g.total, 945);
});
check('0.005 rounds like the server', () => {
    const b = backend.computeBill({ subtotal: 1.005, taxConfig: { gstPct: 100 } });
    const f = frontend.computeBill({ subtotal: 1.005, taxConfig: { gstPct: 100 } });
    assert.equal(f.total, b.total);
    assert.equal(f.gst, b.gst);
});

// 5. billFromOrder — a placed order whose stamped breakdown reconciles
//    shows the server's figures; one that doesn't is recomputed with the
//    server's rules.
check('billFromOrder uses stored breakdown', () => {
    const sb = backend.computeBill({ subtotal: 300, taxConfig: cfg, orderType: 'dine-in' });
    const order = {
        type: 'dine-in', items: [{ price: 150, quantity: 2 }],
        gst: sb.gst, gstPercentage: sb.gstPct, serviceCharge: sb.serviceCharge,
        serviceChargePercentage: sb.serviceChargePct, additionalCharges: sb.additionalCharges,
        additionalChargesTotal: sb.additionalChargesTotal, total: sb.total, manualDiscount: 20,
    };
    const f = frontend.billFromOrder(order, frontend.toTaxConfig(settings.gstOnly));
    assert.equal(f.fromServer, true);
    assert.equal(f.gst, sb.gst);
    assert.equal(f.serviceCharge, sb.serviceCharge);
    assert.equal(f.total, sb.total);
    assert.equal(f.computedTotal, sb.total);
    assert.equal(f.manualDiscount, 20);
});
check('billFromOrder recomputes a legacy order with server rules', () => {
    const order = { type: 'takeaway', items: [{ price: 99.99, quantity: 3 }], total: 314.99 };
    const f = frontend.billFromOrder(order, cfg);
    const b = backend.computeBill({ subtotal: 299.97, taxConfig: cfg, orderType: 'takeaway' });
    assert.equal(f.fromServer, false);
    assert.equal(f.serviceCharge, 0);
    assert.equal(f.computedTotal, b.total);
    assert.equal(f.total, 314.99);
});
// Appended items no longer make the stored breakdown stale.
//
// OLD rule (removed on purpose): any order with appended items (a later
// `addedAt`) ignored the stored GST / charges and re-derived the bill
// from the LIVE tax settings, because appends used to add only the bare
// item delta to order.total. The backend now re-stamps the whole
// breakdown on every append (services/orderBillMath
// .recomputeBillAfterAppend), so the stored figures are authoritative.
// NEW rule: the stored breakdown is used whenever it reconciles with the
// stored total (±₹0.05) — appended items or not. Only a breakdown that
// does NOT add up to order.total falls back to the live tax config.
check('billFromOrder: appended items keep the stored breakdown when it reconciles', () => {
    // Server re-stamped the bill on the full 150 after the append.
    const sb = backend.computeBill({ subtotal: 150, taxConfig: cfg, orderType: 'dine-in' });
    const order = {
        type: 'dine-in',
        items: [
            { price: 100, quantity: 1, addedAt: '2026-01-01T12:00:00Z' },
            { price: 50, quantity: 1, addedAt: '2026-01-01T12:20:00Z' },
        ],
        gst: sb.gst, gstPercentage: sb.gstPct, serviceCharge: sb.serviceCharge,
        serviceChargePercentage: sb.serviceChargePct, additionalCharges: sb.additionalCharges,
        additionalChargesTotal: sb.additionalChargesTotal, total: sb.total,
    };
    // Live settings changed since (GST 18 %) — must not leak into the bill.
    const liveCfg = { ...cfg, gstPct: 18 };
    const f = frontend.billFromOrder(order, liveCfg);
    assert.equal(f.fromServer, true);
    assert.equal(f.gst, sb.gst);
    assert.equal(f.total, sb.total);
    assert.equal(f.computedTotal, sb.total);
});
check('billFromOrder: a stored breakdown that does not reconcile falls back to the live config', () => {
    const sb = backend.computeBill({ subtotal: 100, taxConfig: cfg, orderType: 'dine-in' });
    const order = {
        type: 'dine-in',
        items: [
            { price: 100, quantity: 1, addedAt: '2026-01-01T12:00:00Z' },
            { price: 50, quantity: 1, addedAt: '2026-01-01T12:20:00Z' },
        ],
        // Breakdown for 100, total that is neither 100's nor 150's bill.
        gst: sb.gst, gstPercentage: sb.gstPct, serviceCharge: sb.serviceCharge,
        serviceChargePercentage: sb.serviceChargePct, additionalCharges: sb.additionalCharges,
        additionalChargesTotal: sb.additionalChargesTotal, total: sb.total + 999,
    };
    const f = frontend.billFromOrder(order, cfg);
    const b = backend.computeBill({ subtotal: 150, taxConfig: cfg, orderType: 'dine-in' });
    assert.equal(f.fromServer, false);
    assert.equal(f.computedTotal, b.total);
});

const total = cases.length;
if (failures.length) {
    console.error(`billing parity FAILED — ${failures.length} mismatch(es):`);
    for (const f of failures.slice(0, 50)) console.error(`  ✗ ${f}`);
    process.exit(1);
}
console.log(`billing parity OK — ${total} computeBill cases + toTaxConfig / order-type / billFromOrder checks match Backend/utils/billing.js`);
