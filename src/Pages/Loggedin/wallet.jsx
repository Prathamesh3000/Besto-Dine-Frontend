import React, { useState, useRef, useEffect, useMemo } from "react";
import walletBg from "/walletbgimage.jpeg";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Bell,
  CheckCircle,
  XCircle,
  Wallet as WalletIcon,
  Gift,
  Sparkles,
  ArrowRight,
  ShoppingBag,
  RefreshCw,
  X,
  TrendingUp,
  Clock,
  Plus,
} from "lucide-react";
import api, { settingsAPI, walletAPI, razorpayAPI } from "../../utils/api";
import toast from "react-hot-toast";
import { useAuth } from "../../Context/AuthContext";

// Lazy-load the Razorpay checkout script — same pattern used by every
// other payment surface in the app (BookingHistory, Payment, etc.).
// Resolves with true if the global window.Razorpay is ready, false if
// the script tag failed to load (offline / blocked by an ad blocker).
function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmtINR = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtINR0 = (n) => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;

// ─── Hero card — wallet balance + loyalty points side by side ───────────
//
// Old design only showed loyalty points. The wallet schema actually
// has TWO separate fields (balance in rupees, loyaltyPoints as a count)
// and customers were unaware of their wallet balance entirely. The new
// hero shows both, with the loyalty-points rupee equivalent computed
// from the tenant's pointsToRupee setting so the customer sees what
// their points are actually worth before deciding to redeem.
const WalletHero = ({ balance, points, pointsToRupee, onRedeem, onTopUp }) => {
  const pointValue = (Number(points) || 0) * (Number(pointsToRupee) || 0);
  return (
    <div
      className="mx-4 rounded-[24px] p-5 relative overflow-hidden shadow-[0_8px_30px_-8px_rgba(254,131,1,0.4)]"
      style={{
        backgroundImage: `linear-gradient(135deg, rgba(20, 11, 36, 0.55), rgba(254, 131, 1, 0.35)), url(${walletBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="relative z-10 flex items-center gap-2 mb-4">
        <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
          <WalletIcon size={18} className="text-white" />
        </div>
        <p className="text-white text-[15px] font-nunito font-semibold tracking-wide">
          My Wallet
        </p>
      </div>

      {/* Primary line — wallet rupee balance + Top Up CTA */}
      <div className="relative z-10 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white/80 text-[12px] font-varela leading-tight">
            Available balance
          </p>
          <p className="text-white text-[34px] font-nunito font-bold leading-tight tabular-nums">
            {fmtINR(balance)}
          </p>
        </div>
        <button
          onClick={onTopUp}
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-nunito font-semibold bg-white text-[#FE8301] active:scale-95 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.3)] transition-all"
        >
          <Plus size={16} strokeWidth={2.5} />
          Top Up
        </button>
      </div>

      {/* Divider + secondary loyalty-points block */}
      <div className="relative z-10 mt-4 pt-4 border-t border-white/20 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white/80 text-[12px] font-varela leading-tight flex items-center gap-1.5">
            <Sparkles size={12} className="text-white/80" />
            Loyalty points
          </p>
          <p className="text-white text-[20px] font-nunito font-bold leading-tight tabular-nums">
            {Number(points) || 0}{" "}
            <span className="text-white/80 text-[13px] font-varela font-normal">
              ≈ {fmtINR0(pointValue)}
            </span>
          </p>
        </div>

        <button
          onClick={onRedeem}
          disabled={!points || points <= 0}
          className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-nunito font-semibold transition-all ${
            points > 0
              ? "bg-white text-[#FE8301] active:scale-95 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.3)]"
              : "bg-white/30 text-white/60 cursor-not-allowed"
          }`}
        >
          Redeem
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};

// ─── Top Up Modal — credit money to wallet via Razorpay ───────────────
//
// Customer picks an amount (free entry or quick chip), confirms, and
// the Razorpay checkout opens. On a verified capture, the wallet is
// credited via `verify-wallet-recharge` and the page refreshes its
// balance + transactions. ₹10,000 server-side ceiling mirrored here
// so the UI rejects bad input before a round trip.
const TopUpModal = ({ open, onClose, onConfirm, isPaying }) => {
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (open) setAmount("");
  }, [open]);

  if (!open) return null;

  const chips = [100, 250, 500, 1000];
  const numAmount = Number(amount) || 0;
  const valid = numAmount >= 1 && numAmount <= 10000;
  const tooHigh = numAmount > 10000;

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center md:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isPaying && onClose()} />
      <div
        className="bg-white rounded-t-[28px] md:rounded-[28px] w-full max-w-[420px] relative z-10 px-5 pt-5 pb-6 animate-slideUp md:animate-scaleIn shadow-2xl"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="md:hidden w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

        <div className="flex justify-between items-start mb-1">
          <div className="min-w-0">
            <h2 className="text-[20px] font-nunito font-bold text-[#1A181B] leading-tight">
              Top Up Wallet
            </h2>
            <p className="text-[12px] text-[#8D848F] font-varela mt-0.5">
              Add money to your wallet via UPI, card, or net banking.
            </p>
          </div>
          <button
            onClick={() => !isPaying && onClose()}
            aria-label="Close"
            className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Amount preview tile */}
        <div className="mt-5 bg-gradient-to-br from-[#FFF5E9] to-[#FFEEDC] border border-[#FFE0B7] rounded-2xl p-4">
          <p className="text-[11px] text-[#8D5A0F] font-varela uppercase tracking-wide">
            Amount to add
          </p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-[28px] font-nunito font-bold text-[#1A181B]">₹</span>
            <input
              type="number"
              min={1}
              max={10000}
              step={1}
              inputMode="numeric"
              value={amount}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^\d{0,5}$/.test(v)) setAmount(v);
              }}
              placeholder="0"
              disabled={isPaying}
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[32px] font-nunito font-bold text-[#1A181B] tabular-nums placeholder:text-[#C4B8AC]"
            />
          </div>
          {tooHigh && (
            <p className="text-[11px] text-[#C0392B] font-varela mt-1">
              Maximum top-up is ₹10,000 per transaction.
            </p>
          )}
        </div>

        {/* Quick amount chips */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          {chips.map((value) => {
            const active = numAmount === value;
            return (
              <button
                key={value}
                disabled={isPaying}
                onClick={() => setAmount(String(value))}
                className={`py-2 rounded-xl text-[13px] font-nunito font-semibold transition-all ${
                  active
                    ? "bg-[#FE8301] text-white"
                    : "bg-[#FFF5E9] text-[#8D5A0F] hover:bg-[#FFEEDC] active:scale-95"
                }`}
              >
                ₹{value}
              </button>
            );
          })}
        </div>

        {/* CTA */}
        <button
          onClick={() => valid && onConfirm(numAmount)}
          disabled={isPaying || !valid}
          className={`mt-5 w-full py-3 rounded-2xl font-nunito font-semibold text-[14px] flex items-center justify-center gap-2 transition-all ${
            isPaying || !valid
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-[#FE8301] text-white shadow-[0_4px_15px_-4px_rgba(254,131,1,0.5)] active:scale-[0.98]"
          }`}
        >
          {isPaying ? (
            <>
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Opening payment…
            </>
          ) : !numAmount ? (
            "Enter an amount"
          ) : tooHigh ? (
            "Max ₹10,000"
          ) : (
            <>
              Pay {fmtINR0(numAmount)}
              <ArrowRight size={16} />
            </>
          )}
        </button>

        <p className="text-[11px] text-[#8D848F] font-varela text-center mt-3">
          Powered by Razorpay · UPI / Card / Net Banking
        </p>
      </div>
    </div>
  );
};

// ─── Redeem Points Modal — replaces native prompt() ─────────────────
//
// Slider + quick chips + live preview of what the customer will get.
// Browser prompts can't be styled, fail silently on iOS, and don't
// validate while typing — every cafe POS modernizes this first.
const RedeemPointsModal = ({ open, onClose, points, pointsToRupee, onRedeem, isRedeeming }) => {
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    if (open) setAmount(0);
  }, [open]);

  const maxPoints = Math.max(0, Math.floor(Number(points) || 0));
  const ratio = Number(pointsToRupee) || 0;
  const willGet = Math.round(amount * ratio * 100) / 100;
  const remaining = maxPoints - amount;

  if (!open) return null;

  const chips = [25, 50, 75, 100];

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center md:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isRedeeming && onClose()} />
      <div
        className="bg-white rounded-t-[28px] md:rounded-[28px] w-full max-w-[420px] relative z-10 px-5 pt-5 pb-6 animate-slideUp md:animate-scaleIn shadow-2xl"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {/* drag handle for mobile */}
        <div className="md:hidden w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

        <div className="flex justify-between items-start mb-1">
          <div className="min-w-0">
            <h2 className="text-[20px] font-nunito font-bold text-[#1A181B] leading-tight">
              Redeem Loyalty Points
            </h2>
            <p className="text-[12px] text-[#8D848F] font-varela mt-0.5">
              Convert your points to wallet balance instantly.
            </p>
          </div>
          <button
            onClick={() => !isRedeeming && onClose()}
            aria-label="Close"
            className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Big preview tile — shows what the customer will get */}
        <div className="mt-5 bg-gradient-to-br from-[#FFF5E9] to-[#FFEEDC] border border-[#FFE0B7] rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-[#8D5A0F] font-varela uppercase tracking-wide">
                Redeeming
              </p>
              <p className="text-[24px] font-nunito font-bold text-[#1A181B] tabular-nums leading-tight">
                {amount} <span className="text-[14px] text-[#645E66] font-varela font-normal">pts</span>
              </p>
            </div>
            <ArrowRight size={22} className="text-[#FE8301] shrink-0" />
            <div className="text-right">
              <p className="text-[11px] text-[#8D5A0F] font-varela uppercase tracking-wide">
                You'll get
              </p>
              <p className="text-[24px] font-nunito font-bold text-[#FE8301] tabular-nums leading-tight">
                {fmtINR0(willGet)}
              </p>
            </div>
          </div>
          {ratio > 0 && (
            <p className="text-[11px] text-[#8D5A0F] font-varela mt-2 text-center">
              Conversion rate: {Math.round(1 / ratio)} points = ₹1
            </p>
          )}
        </div>

        {/* Slider */}
        <div className="mt-5">
          <div className="flex justify-between text-[11px] font-varela text-[#8D848F] mb-2">
            <span>0 pts</span>
            <span>{maxPoints} pts available</span>
          </div>
          <input
            type="range"
            min={0}
            max={maxPoints}
            step={1}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            disabled={isRedeeming || maxPoints === 0}
            className="w-full h-2 rounded-full appearance-none cursor-pointer accent-[#FE8301] bg-gray-200"
          />
        </div>

        {/* Quick percentage chips */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          {chips.map((pct) => {
            const value = Math.floor(maxPoints * (pct / 100));
            const active = amount === value && value > 0;
            return (
              <button
                key={pct}
                disabled={isRedeeming || maxPoints === 0}
                onClick={() => setAmount(value)}
                className={`py-2 rounded-xl text-[12px] font-nunito font-semibold transition-all ${
                  active
                    ? "bg-[#FE8301] text-white"
                    : "bg-[#FFF5E9] text-[#8D5A0F] hover:bg-[#FFEEDC] active:scale-95"
                }`}
              >
                {pct === 100 ? "Max" : `${pct}%`}
              </button>
            );
          })}
        </div>

        {/* Footer rows */}
        <div className="mt-4 flex items-center justify-between text-[12px] font-varela text-[#645E66]">
          <span>After redemption</span>
          <span className="font-semibold tabular-nums">{remaining} pts left</span>
        </div>

        {/* CTA */}
        <button
          onClick={() => onRedeem(amount)}
          disabled={isRedeeming || amount <= 0 || amount > maxPoints}
          className={`mt-5 w-full py-3 rounded-2xl font-nunito font-semibold text-[14px] flex items-center justify-center gap-2 transition-all ${
            isRedeeming || amount <= 0 || amount > maxPoints
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-[#FE8301] text-white shadow-[0_4px_15px_-4px_rgba(254,131,1,0.5)] active:scale-[0.98]"
          }`}
        >
          {isRedeeming ? (
            <>
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Redeeming…
            </>
          ) : amount <= 0 ? (
            "Choose an amount"
          ) : (
            <>
              Redeem {amount} pts → {fmtINR0(willGet)}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// ─── Stats row — REAL numbers from transactions, not hardcoded zeros ──
const StatsRow = ({ stats }) => (
  <div className="grid grid-cols-3 gap-3 px-4 mt-4">
    <div className="bg-[#FFF9F4] rounded-2xl p-3 flex flex-col items-center text-center">
      <TrendingUp size={16} className="text-[#FE8301] mb-1" />
      <p className="text-[11px] mt-0.5 text-[#645E66] font-varela leading-tight">
        Earned this month
      </p>
      <p className="text-[16px] font-nunito font-semibold text-[#1A181B] mt-0.5 tabular-nums">
        {stats.earnedThisMonth}
      </p>
    </div>
    <div className="bg-[#F4F8FF] rounded-2xl p-3 flex flex-col items-center text-center">
      <Gift size={16} className="text-[#4D7CFF] mb-1" />
      <p className="text-[11px] mt-0.5 text-[#645E66] font-varela leading-tight">
        Redeemed
      </p>
      <p className="text-[16px] font-nunito font-semibold text-[#1A181B] mt-0.5 tabular-nums">
        {stats.redeemedTotal}
      </p>
    </div>
    <div className="bg-[#F4FFF6] rounded-2xl p-3 flex flex-col items-center text-center">
      <Sparkles size={16} className="text-[#34C759] mb-1" />
      <p className="text-[11px] mt-0.5 text-[#645E66] font-varela leading-tight">
        Lifetime earned
      </p>
      <p className="text-[16px] font-nunito font-semibold text-[#1A181B] mt-0.5 tabular-nums">
        {stats.lifetimeEarned}
      </p>
    </div>
  </div>
);

// ─── Transaction icon — picks an icon by transaction type ─────────────
const TxnIcon = ({ paymentMethod, type }) => {
  const isEarned = type === "earned";
  if (paymentMethod === "wallet") {
    return (
      <div className="w-10 h-10 rounded-xl bg-[#FFE2D6] flex items-center justify-center shrink-0">
        <ShoppingBag size={18} className="text-[#FE8301]" />
      </div>
    );
  }
  if (isEarned) {
    return (
      <div className="w-10 h-10 rounded-xl bg-[#E5FFEB] flex items-center justify-center shrink-0">
        <Sparkles size={18} className="text-[#34C759]" />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-xl bg-[#FFEAEC] flex items-center justify-center shrink-0">
      <RefreshCw size={18} className="text-[#EF4F5F]" />
    </div>
  );
};

const TransactionItem = ({ txn, showDate = true }) => {
  const isEarned = txn.type === "earned";
  const sign = isEarned ? "+" : "";
  const unit = txn.paymentMethod === "wallet" ? "" : " pts";
  return (
    <div className="bg-white border border-[#F2F2F2] rounded-2xl p-3 mb-2 flex items-center gap-3">
      <TxnIcon paymentMethod={txn.paymentMethod} type={txn.type} />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-nunito font-semibold text-[#1A181B] truncate">
          {txn.label}
        </p>
        <p className="text-[11px] text-[#8D848F] font-varela mt-0.5">
          {showDate ? `${txn.date} · ${txn.time}` : txn.time}
        </p>
      </div>
      <p
        className={`text-[15px] font-nunito font-semibold tabular-nums shrink-0 ${
          isEarned ? "text-[#34C759]" : "text-[#EF4F5F]"
        }`}
      >
        {sign}
        {Number(txn.points).toLocaleString("en-IN")}
        {unit}
      </p>
    </div>
  );
};

// ─── How It Works — explains the rules ─────────────────────────────
const HowItWorks = ({ walletSettings = {} }) => {
  const {
    pointsPerRupee = 1,
    pointsToRupee = 0.1,
    maxRedeemPercent = 50,
    pointsExpiryDays = 365,
  } = walletSettings;

  const items = [
    {
      icon: <Sparkles size={14} className="text-[#FE8301]" />,
      text: pointsPerRupee > 0 ? `Earn ${pointsPerRupee} point${pointsPerRupee !== 1 ? "s" : ""} for every ₹1 spent` : "Earn points on every purchase",
    },
    {
      icon: <Gift size={14} className="text-[#FE8301]" />,
      text: pointsToRupee > 0 ? `${Math.round(1 / pointsToRupee)} points = ₹1 wallet credit` : "Redeem points for discounts",
    },
    {
      icon: <ShoppingBag size={14} className="text-[#FE8301]" />,
      text: `Use up to ${maxRedeemPercent}% of any bill from wallet`,
    },
    {
      icon: <Clock size={14} className="text-[#FE8301]" />,
      text: pointsExpiryDays > 0 ? `Points are valid for ${pointsExpiryDays} days` : "Points never expire",
    },
    {
      icon: <RefreshCw size={14} className="text-[#FE8301]" />,
      text: "Refunds for cancelled orders go straight to your wallet",
    },
  ];

  return (
    <div className="mx-4 mt-6 bg-[#FFF9F4] border border-[#FFE9D1] rounded-2xl p-4">
      <p className="text-[15px] font-nunito font-semibold text-[#1A181B] mb-3 flex items-center gap-2">
        <Sparkles size={16} className="text-[#FE8301]" />
        How wallet works
      </p>
      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0 mt-0.5">
              {item.icon}
            </div>
            <p className="text-[13px] text-[#645E66] font-varela leading-snug pt-1">
              {item.text}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ─── Tab Content ──────────────────────────────────────────────────────
const PointsTab = ({ transactions, stats, walletSettings }) => {
  const recent = transactions.slice(0, 5);
  return (
    <>
      <StatsRow stats={stats} />
      <div className="px-4 mt-5">
        <p className="text-[16px] font-nunito font-semibold text-[#1A181B] mb-3">
          Recent activity
        </p>
        {recent.length > 0 ? (
          recent.map((txn) => <TransactionItem key={txn.id} txn={txn} />)
        ) : (
          <EmptyTransactions message="No activity yet — place your first order to start earning." />
        )}
      </div>
      <HowItWorks walletSettings={walletSettings} />
    </>
  );
};

const TransactionTab = ({ transactions, walletSettings }) => {
  const grouped = transactions.reduce((acc, txn) => {
    if (!acc[txn.date]) acc[txn.date] = [];
    acc[txn.date].push(txn);
    return acc;
  }, {});

  return (
    <div className="mt-5">
      <p className="text-[16px] px-4 font-nunito font-semibold text-[#1A181B] mb-3">
        Full history
      </p>
      {Object.entries(grouped).length > 0 ? (
        Object.entries(grouped).map(([date, txns]) => (
          <div key={date} className="mb-4 px-4">
            <p className="text-[12px] font-nunito font-semibold text-[#8D848F] uppercase tracking-wide mb-2">
              {date}
            </p>
            {txns.map((txn) => (
              <TransactionItem key={txn.id} txn={txn} showDate={false} />
            ))}
          </div>
        ))
      ) : (
        <EmptyTransactions message="Your transaction history will appear here." />
      )}
      <HowItWorks walletSettings={walletSettings} />
    </div>
  );
};

const RewardsTab = ({ walletSettings, points, pointsToRupee }) => {
  // Tier visualization — concrete next-milestones the customer can
  // aim for, based on what their points are actually worth in rupees.
  const tiers = [
    { points: 100, label: "₹10 wallet credit" },
    { points: 250, label: "₹25 wallet credit" },
    { points: 500, label: "₹50 wallet credit + free dessert" },
    { points: 1000, label: "₹100 wallet credit + priority pickup" },
  ];
  const nextTier = tiers.find((t) => points < t.points);
  const progress = nextTier ? Math.min(100, (points / nextTier.points) * 100) : 100;

  return (
    <div className="mt-5">
      {nextTier ? (
        <div className="mx-4 bg-gradient-to-br from-[#FFF5E9] to-[#FFEEDC] border border-[#FFE0B7] rounded-2xl p-4">
          <div className="flex justify-between items-baseline mb-2">
            <p className="text-[14px] font-nunito font-semibold text-[#1A181B]">
              Next reward
            </p>
            <p className="text-[12px] text-[#8D5A0F] font-varela tabular-nums">
              {points} / {nextTier.points} pts
            </p>
          </div>
          <p className="text-[15px] text-[#1A181B] font-varela mb-3">
            {nextTier.label}
          </p>
          <div className="h-2 bg-white rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#FE8301] to-[#FFA640] transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] text-[#8D5A0F] font-varela mt-2">
            {nextTier.points - points} more points to unlock
          </p>
        </div>
      ) : (
        <div className="mx-4 bg-[#E5FFEB] border border-[#ABEFC6] rounded-2xl p-4 flex items-center gap-3">
          <Sparkles size={20} className="text-[#34C759] shrink-0" />
          <p className="text-[14px] font-varela text-[#1A181B]">
            You've unlocked every tier — great job! Keep ordering to earn more wallet credit.
          </p>
        </div>
      )}

      <p className="text-[16px] px-4 font-nunito font-semibold text-[#1A181B] mt-6 mb-3">
        Reward tiers
      </p>
      <div className="px-4 space-y-2">
        {tiers.map((t) => {
          const unlocked = points >= t.points;
          return (
            <div
              key={t.points}
              className={`rounded-2xl p-3 flex items-center gap-3 border ${
                unlocked
                  ? "bg-[#E5FFEB] border-[#ABEFC6]"
                  : "bg-white border-[#F2F2F2]"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  unlocked ? "bg-[#34C759]" : "bg-[#FFF5E9]"
                }`}
              >
                {unlocked ? (
                  <CheckCircle size={20} className="text-white" />
                ) : (
                  <Gift size={20} className="text-[#FE8301]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-nunito font-semibold text-[#1A181B]">
                  {t.label}
                </p>
                <p className="text-[11px] text-[#8D848F] font-varela mt-0.5">
                  {t.points} points
                </p>
              </div>
              {unlocked ? (
                <span className="text-[11px] font-nunito font-semibold text-[#027A48] uppercase tracking-wide">
                  Unlocked
                </span>
              ) : (
                <span className="text-[11px] font-nunito font-semibold text-[#8D848F] tabular-nums">
                  +{t.points - points} pts
                </span>
              )}
            </div>
          );
        })}
      </div>

      <HowItWorks walletSettings={walletSettings} />
    </div>
  );
};

const EmptyTransactions = ({ message }) => (
  <div className="bg-white border border-[#F2F2F2] rounded-2xl p-8 flex flex-col items-center text-center">
    <div className="w-12 h-12 rounded-full bg-[#FFF9F4] flex items-center justify-center mb-3">
      <Sparkles size={20} className="text-[#FE8301]" />
    </div>
    <p className="text-[14px] font-varela text-[#645E66] max-w-[260px]">
      {message}
    </p>
  </div>
);

// ─── Main Wallet Screen ────────────────────────────────────────────────────────

const TABS = ["Points", "Transaction", "Rewards"];

const tabSlideStyle = `
  @keyframes slideInFromRight {
    from { opacity: 0; transform: translateX(40px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes slideInFromLeft {
    from { opacity: 0; transform: translateX(-40px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  .tab-slide-right {
    animation: slideInFromRight 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
  }
  .tab-slide-left {
    animation: slideInFromLeft 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
  }
`;

function Wallet() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("Points");
  const [walletData, setWalletData] = useState({ balance: 0, loyaltyPoints: 0, transactions: [] });
  const [walletSettings, setWalletSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [isPayingTopUp, setIsPayingTopUp] = useState(false);
  const directionRef = useRef("right");

  const fetchWallet = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/wallet?t=${Date.now()}`);
      if (res.data.success) {
        setWalletData(res.data);
      }
    } catch (error) {
      console.error("Failed to fetch wallet info:", error);
      toast.error("Could not load wallet. Please refresh.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet();
    window.scrollTo(0, 0);

    settingsAPI
      .getSettings()
      .then((res) => {
        if (res.data?.wallet) setWalletSettings(res.data.wallet);
      })
      .catch(() => {});

    const onFocus = () => fetchWallet();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const handleTabChange = (tab) => {
    const oldIndex = TABS.indexOf(activeTab);
    const newIndex = TABS.indexOf(tab);
    directionRef.current = newIndex > oldIndex ? "right" : "left";
    setActiveTab(tab);
  };

  // Compute REAL stats from the transaction list — no more hardcoded
  // zeros. Lifetime earned + redeemed totals come from summing all
  // earned/used point transactions; "this month" filters by date.
  const stats = useMemo(() => {
    const txns = walletData.transactions || [];
    const now = new Date();
    const thisMonth = txns.filter((t) => {
      if (!t.date) return false;
      const d = new Date(t.date);
      return !Number.isNaN(d.getTime())
        && d.getMonth() === now.getMonth()
        && d.getFullYear() === now.getFullYear();
    });
    const sumPositive = (list) => list
      .filter((t) => t.type === "earned" && t.paymentMethod === "points")
      .reduce((sum, t) => sum + (Number(t.points) || 0), 0);
    const sumRedeemed = (list) => list
      .filter((t) => t.type === "used")
      .reduce((sum, t) => sum + Math.abs(Number(t.points) || 0), 0);
    return {
      earnedThisMonth: sumPositive(thisMonth),
      redeemedTotal: sumRedeemed(txns),
      lifetimeEarned: sumPositive(txns),
    };
  }, [walletData.transactions]);

  // Wallet top-up via Razorpay. Mirrors the BookingHistory pay-remaining
  // flow: lazy-load the checkout script, create a server-side recharge
  // order, open the Razorpay modal, and on signature-verified capture
  // credit the wallet via /verify-wallet-recharge. The wallet balance
  // and transaction list are re-fetched on success so the customer
  // sees the new balance + the wallet_recharge row immediately.
  const handleTopUp = async (amount) => {
    if (!amount || amount <= 0 || amount > 10000 || isPayingTopUp) return;
    setIsPayingTopUp(true);
    try {
      const ok = await loadRazorpayScript();
      if (!ok) {
        toast.error("Payment gateway failed to load. Check your connection and retry.");
        setIsPayingTopUp(false);
        return;
      }

      const { data } = await razorpayAPI.createWalletRecharge(amount);
      if (!data?.success) {
        toast.error(data?.message || "Could not start top-up.");
        setIsPayingTopUp(false);
        return;
      }

      const options = {
        key: data.key,
        amount: data.razorpayOrder.amount,
        currency: data.razorpayOrder.currency,
        name: "BestoDine",
        description: `Wallet top-up of ₹${amount}`,
        order_id: data.razorpayOrder.id,
        handler: async (response) => {
          try {
            const verifyRes = await razorpayAPI.verifyWalletRecharge({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              amount,
            });
            if (verifyRes.data?.success) {
              toast.success(`₹${amount} added to your wallet.`);
              setTopUpOpen(false);
              await fetchWallet();
            } else {
              toast.error(verifyRes.data?.message || "Top-up verification failed.");
            }
          } catch (err) {
            toast.error(err?.response?.data?.message || "Top-up verification failed.");
          } finally {
            setIsPayingTopUp(false);
          }
        },
        modal: {
          // Customer closed the Razorpay popup without paying — re-enable
          // the CTA so they can retry without reloading.
          ondismiss: () => setIsPayingTopUp(false),
        },
        prefill: {
          name: user?.name || "",
          email: user?.email || "",
          contact: user?.mobile || "",
        },
        theme: { color: "#FE8301" },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", () => {
        toast.error("Payment failed. Please try again.");
        setIsPayingTopUp(false);
      });
      rzp.open();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not start top-up.");
      setIsPayingTopUp(false);
    }
  };

  const handleRedeem = async (amount) => {
    if (!amount || amount <= 0) return;
    setIsRedeeming(true);
    try {
      const res = await walletAPI.redeemPoints(amount);
      if (res.data?.success) {
        toast.success(res.data.message || `Redeemed ${amount} points!`);
        setRedeemOpen(false);
        await fetchWallet();
      } else {
        toast.error(res.data?.message || "Redemption failed");
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Redemption failed");
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <>
      <style>{tabSlideStyle}</style>
      <div className="min-h-screen bg-[#FAFAFA] pb-10 lg:max-w-3xl mx-auto">
        <header className="flex items-center justify-between px-4 pt-4 pb-3 sticky top-0 bg-[#FAFAFA] z-40">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-1 -ml-1 rounded-full hover:bg-gray-100 active:scale-95 transition-transform"
            >
              <ChevronLeft size={24} className="text-[#666666]" />
            </button>
            <h1 className="text-[16px] leading-[28px] font-medium font-nunito text-[#1A181B]">
              My Wallet
            </h1>
          </div>
          <button
            onClick={fetchWallet}
            className="p-2 rounded-full hover:bg-gray-100 active:scale-95 transition-transform"
            aria-label="Refresh wallet"
            title="Refresh"
          >
            <RefreshCw size={20} className="text-[#8D848F]" />
          </button>
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center pt-20">
            <div className="w-10 h-10 border-4 border-[#FF9B0B] border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-gray-500 font-varela">Loading your wallet…</p>
          </div>
        ) : (
          <>
            <WalletHero
              balance={walletData.balance}
              points={walletData.loyaltyPoints}
              pointsToRupee={walletSettings.pointsToRupee}
              onRedeem={() => setRedeemOpen(true)}
              onTopUp={() => setTopUpOpen(true)}
            />

            <div className="flex items-center px-4 mt-5 border-b border-gray-100">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  className={`flex-1 py-2.5 text-[14px] leading-[16px] font-nunito font-semibold transition-colors relative ${
                    activeTab === tab ? "text-[#1A181B]" : "text-[#8D848F]"
                  }`}
                >
                  {tab === "Transaction" ? "History" : tab}
                  {activeTab === tab && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[80px] h-[2.5px] bg-[#FF9B0B] rounded-t-[16px]" />
                  )}
                </button>
              ))}
            </div>

            <div className="mt-1 pb-6">
              <div
                key={activeTab}
                className={
                  directionRef.current === "right"
                    ? "tab-slide-right"
                    : "tab-slide-left"
                }
              >
                {activeTab === "Points" && (
                  <PointsTab
                    transactions={walletData.transactions}
                    stats={stats}
                    walletSettings={walletSettings}
                  />
                )}
                {activeTab === "Transaction" && (
                  <TransactionTab
                    transactions={walletData.transactions}
                    walletSettings={walletSettings}
                  />
                )}
                {activeTab === "Rewards" && (
                  <RewardsTab
                    walletSettings={walletSettings}
                    points={walletData.loyaltyPoints}
                    pointsToRupee={walletSettings.pointsToRupee}
                  />
                )}
              </div>
            </div>
          </>
        )}

        <RedeemPointsModal
          open={redeemOpen}
          onClose={() => setRedeemOpen(false)}
          points={walletData.loyaltyPoints}
          pointsToRupee={walletSettings.pointsToRupee}
          onRedeem={handleRedeem}
          isRedeeming={isRedeeming}
        />

        <TopUpModal
          open={topUpOpen}
          onClose={() => setTopUpOpen(false)}
          onConfirm={handleTopUp}
          isPaying={isPayingTopUp}
        />
      </div>
    </>
  );
}

export default Wallet;
