import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  Camera,
  Loader2,
  User as UserIcon,
  Phone,
  Utensils,
  MapPin,
  Heart,
} from "lucide-react";
import { useAuth } from "../../Context/AuthContext";
import api from "../../utils/api";
import { resolveImageUrl } from "../../utils/image";
import toast from "react-hot-toast";
import { sanitizeMobileInput } from "../../utils/mobile";

const fallbackAvatar = (name) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'U')}&background=FE8301&color=fff&size=128`;

// ISO Date (or Date object) → "YYYY-MM-DD" for <input type="date">.
// Returns '' for falsy / unparseable inputs.
const toDateInputValue = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Translation keys (not display strings) — resolved at render time via
// t(labelKey). Keeps these constants pure so they don't capture a stale
// t() reference.
const GENDER_OPTIONS = [
  { value: 'male',              labelKey: 'edit_profile.gender_male' },
  { value: 'female',            labelKey: 'edit_profile.gender_female' },
  { value: 'other',             labelKey: 'edit_profile.gender_other' },
  { value: 'prefer_not_to_say', labelKey: 'edit_profile.gender_prefer_not_to_say' },
];

const DIET_OPTIONS = [
  { value: 'veg',         labelKey: 'edit_profile.diet_veg',        dot: 'bg-green-600' },
  { value: 'non_veg',     labelKey: 'edit_profile.diet_non_veg',    dot: 'bg-red-600' },
  { value: 'eggetarian',  labelKey: 'edit_profile.diet_eggetarian', dot: 'bg-amber-500' },
  { value: 'vegan',       labelKey: 'edit_profile.diet_vegan',      dot: 'bg-emerald-700' },
  { value: 'jain',        labelKey: 'edit_profile.diet_jain',       dot: 'bg-yellow-500' },
];

// Today as "YYYY-MM-DD" for the <input type="date" max=...> guard.
const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <section
      className="bg-white border border-[#F2F1FA] rounded-2xl p-4 sm:p-5"
      style={{ boxShadow: '0px 4px 8.4px 0px #D0C9F833' }}
    >
      <header className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-full bg-[#FFF4E8] flex items-center justify-center">
          <Icon size={18} className="text-[#FE8301]" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[#1A181B] font-nunito leading-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[11.5px] text-[#8D848F] font-varela mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ id, label, required, optional, optionalLabel, error, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-semibold text-[#645E66] mb-1.5 font-varela">
        {label}
        {required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
        {optional && <span className="text-[#8D848F] font-normal ml-1">{optionalLabel || '(optional)'}</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} role="alert" className="text-xs text-red-600 mt-1.5 flex items-center gap-1 font-varela">
          <span aria-hidden="true">⚠</span>{error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-[#8D848F] mt-1 font-varela">{hint}</p>
      ) : null}
    </div>
  );
}

const baseInput =
  "w-full h-12 px-4 bg-[#F9F9F9] border rounded-xl text-[15px] text-[#1A181B] font-varela outline-none focus:ring-1 transition-all";
const okInput  = "border-[#EEEEEE] focus:border-[#FE8301] focus:ring-[#FE8301]/20";
const badInput = "border-red-400 focus:border-red-500 focus:ring-red-200";

function EditProfile() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, updateProfile } = useAuth();

  // ── Form state ───────────────────────────────────────────────────────────
  const [name, setName] = useState(user?.name || "");
  const [mobile, setMobile] = useState(user?.mobile || "");
  const [allergy, setAllergy] = useState(user?.allergy || "");
  const [dob, setDob] = useState(toDateInputValue(user?.dob));
  const [anniversary, setAnniversary] = useState(toDateInputValue(user?.anniversary));
  const [gender, setGender] = useState(user?.gender || '');
  const [dietaryPreference, setDietaryPreference] = useState(user?.dietaryPreference || '');
  const [address, setAddress] = useState({
    line1:    user?.address?.line1    || '',
    line2:    user?.address?.line2    || '',
    city:     user?.address?.city     || '',
    state:    user?.address?.state    || '',
    pincode:  user?.address?.pincode  || '',
    landmark: user?.address?.landmark || '',
  });

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState({});
  const fileInputRef = React.useRef(null);

  // ── Completeness meter ───────────────────────────────────────────────────
  // Light-touch nudge so customers can see what's still empty. Required
  // fields (name, mobile) count double; the rest one each. Not blocking —
  // pure UX.
  const completeness = useMemo(() => {
    const checks = [
      [!!name.trim(),                          2],
      [/^[6-9]\d{9}$/.test(mobile),            2],
      [!!dob,                                  1],
      [!!gender,                               1],
      [!!dietaryPreference,                    1],
      [!!allergy.trim(),                       1],
      [!!(address.line1 && address.city && address.pincode), 1],
      [!!user?.avatar,                         1],
    ];
    const total = checks.reduce((s, [, w]) => s + w, 0);
    const got   = checks.reduce((s, [ok, w]) => s + (ok ? w : 0), 0);
    return Math.round((got / total) * 100);
  }, [name, mobile, dob, gender, dietaryPreference, allergy, address, user?.avatar]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const clearErr = (key) => {
    setErrors(prev => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('image', file);
      const res = await api.post('/auth/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data?.success && res.data?.user) {
        updateProfile(res.data.user);
        toast.success('Avatar updated');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload avatar');
    } finally {
      setUploading(false);
      // Allow re-selecting the same file
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    const trimmedName     = name.trim();
    const cleanMobile     = mobile.trim().replace(/[\s-]/g, '');
    const trimmedAllergy  = allergy.trim();
    const trimmedPincode  = address.pincode.trim();

    // Build all errors so the user sees everything to fix.
    const errs = {};
    if (!trimmedName)                              errs.name = t('edit_profile.err_name_required');
    else if (trimmedName.length > 100)             errs.name = t('edit_profile.err_name_too_long');

    if (!cleanMobile)                              errs.mobile = t('edit_profile.err_mobile_required');
    else if (!/^[6-9]\d{9}$/.test(cleanMobile))    errs.mobile = t('edit_profile.err_mobile_format');

    if (trimmedAllergy.length > 1000)              errs.allergy = t('edit_profile.err_allergy_too_long');

    if (dob) {
      const d = new Date(dob);
      if (Number.isNaN(d.getTime()) || d >= new Date()) errs.dob = t('edit_profile.err_dob_past');
    }
    if (anniversary) {
      const d = new Date(anniversary);
      if (Number.isNaN(d.getTime()) || d >= new Date()) errs.anniversary = t('edit_profile.err_anniversary_past');
    }
    if (trimmedPincode && !/^[1-9]\d{5}$/.test(trimmedPincode)) {
      errs.pincode = t('edit_profile.err_pincode');
    }

    setErrors(errs);
    if (Object.keys(errs).length) {
      const order = ['name', 'mobile', 'dob', 'anniversary', 'allergy', 'pincode'];
      const firstBad = order.find(k => errs[k]);
      if (firstBad) {
        setTimeout(() => {
          const el = document.getElementById(firstBad);
          if (el) { try { el.focus() } catch { /* noop */ } el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) }
        }, 0);
      }
      toast.error(t('edit_profile.fix_errors'));
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: trimmedName,
        mobile: cleanMobile,
        allergy: trimmedAllergy,
        dob: dob || '',
        anniversary: anniversary || '',
        gender,
        dietaryPreference,
        address: {
          line1:    address.line1.trim(),
          line2:    address.line2.trim(),
          city:     address.city.trim(),
          state:    address.state.trim(),
          pincode:  trimmedPincode,
          landmark: address.landmark.trim(),
        },
      };

      const res = await api.put("/auth/profile", payload, { _silent: true });

      if (res.data.success) {
        updateProfile(res.data.user);
        toast.success("Profile updated");
        navigate(-1);
      }
    } catch (err) {
      console.error("Profile update failed:", err);
      const msg = err.response?.data?.message;
      if (/mobile.*(taken|exist|in use|registered)/i.test(msg || '')) {
        setErrors(prev => ({ ...prev, mobile: msg }));
      } else if (/pincode/i.test(msg || '')) {
        setErrors(prev => ({ ...prev, pincode: msg }));
      } else if (/date of birth/i.test(msg || '')) {
        setErrors(prev => ({ ...prev, dob: msg }));
      } else if (/anniversary/i.test(msg || '')) {
        setErrors(prev => ({ ...prev, anniversary: msg }));
      } else {
        toast.error(msg || "Failed to update profile. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  // Prevent body scroll under the sticky save bar from feeling janky on
  // mobile by reserving exactly the bar's height as bottom padding.
  useEffect(() => { document.body.style.overflow = ''; }, []);

  return (
    <div className="min-h-screen bg-[#FAF7F4] pb-32 lg:max-w-3xl mx-auto font-nunito">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 py-3.5 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-1 -ml-1 rounded-full hover:bg-gray-100 active:scale-95 transition-transform"
          aria-label={t('common.back')}
        >
          <ChevronLeft size={24} className="text-[#1A181B]" />
        </button>
        <h1 className="text-[16px] font-semibold text-[#1A181B] leading-[28px] flex-1">
          {t('edit_profile.title')}
        </h1>
        <span className="text-[12px] font-semibold text-[#FE8301] bg-[#FFF4E8] px-2.5 py-1 rounded-full">
          {t('edit_profile.complete_label', { n: completeness })}
        </span>
      </header>

      <main className="px-4 pt-5 space-y-5">
        {/* ── Avatar card ─────────────────────────────────────────────── */}
        <div
          className="bg-white rounded-2xl p-5 sm:p-6 text-center"
          style={{ boxShadow: '0px 4px 8.4px 0px #D0C9F833' }}
        >
          <div className="relative inline-block">
            <img
              src={resolveImageUrl(user?.avatar) || fallbackAvatar(user?.name)}
              alt="Profile"
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-2 border-white shadow-sm"
              onError={(e) => {
                if (e.target.src !== fallbackAvatar(user?.name)) {
                  e.target.onerror = null;
                  e.target.src = fallbackAvatar(user?.name);
                }
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label={t('edit_profile.tap_camera')}
              className="absolute bottom-0 right-0 w-9 h-9 bg-[#FE8301] rounded-full flex items-center justify-center border-2 border-white active:scale-95 transition-transform shadow-md disabled:opacity-60"
            >
              {uploading ? <Loader2 size={15} className="text-white animate-spin" /> : <Camera size={15} className="text-white" />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>
          <p className="text-[12px] text-[#8D848F] mt-2 font-varela">
            {t('edit_profile.tap_camera')}
          </p>

          {/* Completeness bar */}
          <div className="mt-4">
            <div className="h-1.5 w-full bg-[#F1F0FC] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#FE8301] to-[#FFB266] transition-all duration-500"
                style={{ width: `${completeness}%` }}
              />
            </div>
            <p className="text-[11.5px] text-[#8D848F] font-varela mt-1.5">
              {completeness < 100
                ? t('edit_profile.complete_hint')
                : t('edit_profile.complete_done')}
            </p>
          </div>
        </div>

        {/* ── Personal info ───────────────────────────────────────────── */}
        <Section icon={UserIcon} title={t('edit_profile.personal_info')} subtitle={t('edit_profile.personal_info_sub')}>
          <Field id="name" label={t('edit_profile.full_name')} required error={errors.name}>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); clearErr('name'); }}
              maxLength={100}
              autoComplete="name"
              aria-required="true"
              aria-invalid={errors.name ? 'true' : 'false'}
              aria-describedby={errors.name ? 'name-err' : undefined}
              className={`${baseInput} ${errors.name ? badInput : okInput}`}
              placeholder={t('edit_profile.full_name_ph')}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="dob" label={t('edit_profile.dob')} optional optionalLabel={t('common.optional')} error={errors.dob} hint={t('edit_profile.dob_hint')}>
              <input
                id="dob"
                type="date"
                value={dob}
                max={today}
                onChange={(e) => { setDob(e.target.value); clearErr('dob'); }}
                aria-invalid={errors.dob ? 'true' : 'false'}
                aria-describedby={errors.dob ? 'dob-err' : undefined}
                className={`${baseInput} ${errors.dob ? badInput : okInput}`}
              />
            </Field>

            <Field id="anniversary" label={t('edit_profile.anniversary')} optional optionalLabel={t('common.optional')} error={errors.anniversary} hint={t('edit_profile.anniversary_hint')}>
              <input
                id="anniversary"
                type="date"
                value={anniversary}
                max={today}
                onChange={(e) => { setAnniversary(e.target.value); clearErr('anniversary'); }}
                aria-invalid={errors.anniversary ? 'true' : 'false'}
                aria-describedby={errors.anniversary ? 'anniversary-err' : undefined}
                className={`${baseInput} ${errors.anniversary ? badInput : okInput}`}
              />
            </Field>
          </div>

          <Field id="gender" label={t('edit_profile.gender')} optional optionalLabel={t('common.optional')}>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('edit_profile.gender')}>
              {GENDER_OPTIONS.map(opt => {
                const active = gender === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setGender(active ? '' : opt.value)}
                    className={`px-3.5 h-10 rounded-full border text-[13px] font-varela transition-all ${
                      active
                        ? 'bg-[#FE8301] border-[#FE8301] text-white shadow-sm'
                        : 'bg-white border-[#EEEEEE] text-[#1A181B] hover:border-[#FE8301]/40'
                    }`}
                  >
                    {t(opt.labelKey)}
                  </button>
                );
              })}
            </div>
          </Field>
        </Section>

        {/* ── Contact ─────────────────────────────────────────────────── */}
        <Section icon={Phone} title={t('edit_profile.contact')} subtitle={t('edit_profile.contact_sub')}>
          <Field id="email" label={t('edit_profile.email')} hint={t('edit_profile.email_locked_hint')}>
            <input
              id="email"
              type="email"
              value={user?.email || ""}
              disabled
              className="w-full h-12 px-4 bg-[#F4F4F4] border border-[#EEEEEE] rounded-xl text-[15px] text-[#8D848F] font-varela cursor-not-allowed"
            />
          </Field>

          <Field id="mobile" label={t('edit_profile.mobile')} required error={errors.mobile}>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-[#645E66] font-varela pointer-events-none">
                +91
              </span>
              <input
                id="mobile"
                type="tel"
                inputMode="numeric"
                value={mobile}
                onChange={(e) => { setMobile(sanitizeMobileInput(e.target.value)); clearErr('mobile'); }}
                pattern="[6-9][0-9]{9}"
                autoComplete="tel-national"
                aria-required="true"
                aria-invalid={errors.mobile ? 'true' : 'false'}
                aria-describedby={errors.mobile ? 'mobile-err' : undefined}
                className={`${baseInput} pl-12 ${errors.mobile ? badInput : okInput}`}
                placeholder={t('edit_profile.mobile_ph')}
              />
            </div>
          </Field>
        </Section>

        {/* ── Food preferences ────────────────────────────────────────── */}
        <Section icon={Utensils} title={t('edit_profile.food_prefs')} subtitle={t('edit_profile.food_prefs_sub')}>
          <Field id="diet" label={t('edit_profile.dietary_pref')} optional optionalLabel={t('common.optional')}>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('edit_profile.dietary_pref')}>
              {DIET_OPTIONS.map(opt => {
                const active = dietaryPreference === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setDietaryPreference(active ? '' : opt.value)}
                    className={`flex items-center gap-2 px-3.5 h-10 rounded-full border text-[13px] font-varela transition-all ${
                      active
                        ? 'bg-[#FE8301] border-[#FE8301] text-white shadow-sm'
                        : 'bg-white border-[#EEEEEE] text-[#1A181B] hover:border-[#FE8301]/40'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${active ? 'bg-white' : opt.dot}`} />
                    {t(opt.labelKey)}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field
            id="allergy"
            label={t('edit_profile.allergies')}
            optional
            optionalLabel={t('common.optional')}
            error={errors.allergy}
          >
            <textarea
              id="allergy"
              value={allergy}
              onChange={(e) => { setAllergy(e.target.value); clearErr('allergy'); }}
              rows={3}
              maxLength={1000}
              aria-invalid={errors.allergy ? 'true' : 'false'}
              aria-describedby={errors.allergy ? 'allergy-err' : undefined}
              className={`w-full px-4 py-3 bg-[#F9F9F9] border rounded-xl text-[15px] text-[#1A181B] font-varela outline-none focus:ring-1 transition-all resize-none ${errors.allergy ? badInput : okInput}`}
              placeholder={t('edit_profile.allergies_ph')}
            />
            <div className="flex items-center justify-end mt-1">
              <p className="text-[11px] text-[#8D848F] font-varela">{allergy.length}/1000</p>
            </div>
          </Field>
        </Section>

        {/* ── Default address ─────────────────────────────────────────── */}
        <Section icon={MapPin} title={t('edit_profile.default_address')} subtitle={t('edit_profile.default_address_sub')}>
          <Field id="line1" label={t('edit_profile.address_line1')} optional optionalLabel={t('common.optional')}>
            <input
              id="line1"
              type="text"
              value={address.line1}
              onChange={(e) => setAddress(a => ({ ...a, line1: e.target.value }))}
              maxLength={200}
              autoComplete="address-line1"
              className={`${baseInput} ${okInput}`}
              placeholder={t('edit_profile.address_line1_ph')}
            />
          </Field>

          <Field id="line2" label={t('edit_profile.address_line2')} optional optionalLabel={t('common.optional')}>
            <input
              id="line2"
              type="text"
              value={address.line2}
              onChange={(e) => setAddress(a => ({ ...a, line2: e.target.value }))}
              maxLength={200}
              autoComplete="address-line2"
              className={`${baseInput} ${okInput}`}
              placeholder={t('edit_profile.address_line2_ph')}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field id="city" label={t('edit_profile.city')} optional optionalLabel={t('common.optional')}>
              <input
                id="city"
                type="text"
                value={address.city}
                onChange={(e) => setAddress(a => ({ ...a, city: e.target.value }))}
                maxLength={100}
                autoComplete="address-level2"
                className={`${baseInput} ${okInput}`}
                placeholder="Pune"
              />
            </Field>

            <Field id="state" label={t('edit_profile.state')} optional optionalLabel={t('common.optional')}>
              <input
                id="state"
                type="text"
                value={address.state}
                onChange={(e) => setAddress(a => ({ ...a, state: e.target.value }))}
                maxLength={100}
                autoComplete="address-level1"
                className={`${baseInput} ${okInput}`}
                placeholder="Maharashtra"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field id="pincode" label={t('edit_profile.pincode')} optional optionalLabel={t('common.optional')} error={errors.pincode}>
              <input
                id="pincode"
                type="text"
                inputMode="numeric"
                value={address.pincode}
                onChange={(e) => { setAddress(a => ({ ...a, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })); clearErr('pincode'); }}
                maxLength={6}
                autoComplete="postal-code"
                aria-invalid={errors.pincode ? 'true' : 'false'}
                aria-describedby={errors.pincode ? 'pincode-err' : undefined}
                className={`${baseInput} ${errors.pincode ? badInput : okInput}`}
                placeholder="411001"
              />
            </Field>

            <Field id="landmark" label={t('edit_profile.landmark')} optional optionalLabel={t('common.optional')}>
              <input
                id="landmark"
                type="text"
                value={address.landmark}
                onChange={(e) => setAddress(a => ({ ...a, landmark: e.target.value }))}
                maxLength={200}
                className={`${baseInput} ${okInput}`}
                placeholder={t('edit_profile.landmark_ph')}
              />
            </Field>
          </div>
        </Section>

        {/* Spacer so last card isn't hidden behind sticky bar */}
        <div className="h-2" />
      </main>

      {/* ── Sticky save bar ──────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-gray-100 px-4 py-3 lg:max-w-3xl lg:mx-auto">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            disabled={saving}
            className="h-12 px-5 rounded-xl border border-[#EEEEEE] text-[14px] font-semibold text-[#645E66] font-varela active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            aria-busy={saving ? 'true' : 'false'}
            className="flex-1 h-12 bg-[#FE8301] text-white rounded-xl font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
          >
            {saving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {t('common.saving')}
              </>
            ) : (
              <>
                <Heart size={16} className="opacity-80" />
                {t('edit_profile.save_changes')}
              </>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}

export default EditProfile;
