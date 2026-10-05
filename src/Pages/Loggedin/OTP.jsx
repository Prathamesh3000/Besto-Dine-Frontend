import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import api from '../../utils/api';
import { claimCustomerData } from '../../utils/customerSession';
import { setAuth } from '../../utils/authStorage';

// #11 — backend issues 6-digit codes.
const OTP_LENGTH = 6;
const emptyOtp = () => Array(OTP_LENGTH).fill('');

function OTP() {
  const navigate = useNavigate();
  const location = useLocation();

  const phoneNumber = location.state?.phoneNumber || '';
  const countryCode = location.state?.countryCode || '+91';
  const fullMobile = `${countryCode}${phoneNumber}`;

  const [otp, setOtp] = useState(emptyOtp);
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  // Synchronous in-flight guard: the auto-submit timer and a tap on
  // "Verify" can both fire before `isVerifying` re-renders the button
  // disabled, and a second verify races the first for a single-use code.
  // Stays set after a success (the page is navigating away).
  const verifyInFlightRef = useRef(false);
  const [resendTimer, setResendTimer] = useState(30);
  const inputRefs = [useRef(null), useRef(null), useRef(null), useRef(null), useRef(null), useRef(null)];

  // Auto-focus first input on mount
  useEffect(() => {
    inputRefs[0].current?.focus();
  }, []);

  // Resend cooldown timer
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => setResendTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError('');

    if (value && index < OTP_LENGTH - 1) {
      inputRefs[index + 1].current?.focus();
    }

    // Auto-submit when all digits are entered
    if (value) {
      const fullOtp = newOtp.join('');
      if (fullOtp.length === OTP_LENGTH) {
        setTimeout(() => handleVerifyOTP(fullOtp), 100);
      }
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (pastedData.length === OTP_LENGTH) {
      const newOtp = pastedData.split('');
      setOtp(newOtp);
      inputRefs[OTP_LENGTH - 1].current?.focus();
      setTimeout(() => handleVerifyOTP(pastedData), 100);
    }
  };

  const handleVerifyOTP = async (otpValue) => {
    const otpString = otpValue || otp.join('');

    if (otpString.length !== OTP_LENGTH) {
      setError(`Please enter the ${OTP_LENGTH}-digit OTP`);
      return;
    }

    if (verifyInFlightRef.current) return;
    verifyInFlightRef.current = true;
    let verified = false;
    setIsVerifying(true);
    setError('');

    try {
      const { data } = await api.post('/auth/verify-otp', {
        mobile: fullMobile,
        code: otpString,
      });

      if (data.success) {
        verified = true;
        // Store user data and token (same shape as login/register response)
        // eslint-disable-next-line no-unused-vars
        const { token, refreshToken, success, needsName, ...userData } = data;
        // Wipe another customer's cached data before this account's
        // screens load (a guest signing in keeps their cart).
        claimCustomerData(userData._id || userData.id, {
          keepUnowned: localStorage.getItem('isGuest') === 'true',
        });
        // Customer audience — stores token, user and the #28 refresh token.
        setAuth(token, userData, 'customer', refreshToken);
        localStorage.setItem('cafeUser', JSON.stringify(userData));
        localStorage.removeItem('isGuest');

        // Let AuthContext pick up the new session and navigate properly
        const tableData = localStorage.getItem('dineInTable');
        const orderType = localStorage.getItem('orderType');
        if (tableData) {
          // Claim the QR-scanned table (best-effort) so the admin Live
          // Feed shows the real diner instead of "Walk-in Guest" while
          // the customer browses the menu pre-order. Awaiting blocks the
          // hard reload so the request actually fires.
          try {
            const dineInTable = JSON.parse(tableData);
            if (dineInTable?._id) {
              await api.post(`/tables/${dineInTable._id}/claim`).catch(() => {});
            }
          } catch { /* ignore malformed localStorage */ }
          window.location.href = '/customer/home'; // Reload needed for AuthContext to pick up new token
        } else if (orderType === 'takeaway') {
          window.location.href = '/branch-selection';
        } else {
          window.location.href = '/customer/home';
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Verification failed. Please try again.';
      setError(msg);
    } finally {
      if (!verified) verifyInFlightRef.current = false;
      setIsVerifying(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendTimer > 0) return;

    setOtp(emptyOtp());
    setError('');
    inputRefs[0].current?.focus();

    try {
      await api.post('/auth/send-otp', { mobile: fullMobile });
      setResendTimer(30);
    } catch {
      setError('Failed to resend OTP. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-white-900 flex flex-col transition-colors duration-200">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white-900 border-b border-gray-100 px-4 py-3 sm:py-4 flex justify-between items-center transition-colors">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 px-6 md:px-8 pt-8 md:pt-10 pb-10 md:pb-12">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-2">
          Enter OTP
        </h1>
        <p className="text-sm sm:text-base md:text-base text-gray-500 mb-6 sm:mb-8 md:mb-10">
          We've sent a {OTP_LENGTH}-digit code to {countryCode} {phoneNumber}
        </p>

        {/* OTP Input */}
        <div className="flex gap-2 sm:gap-3 md:gap-4 justify-center mb-6 sm:mb-8 md:mb-8">
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={inputRefs[index]}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={index === 0 ? handlePaste : undefined}
              disabled={isVerifying}
              className={`w-11 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 text-center text-xl sm:text-2xl md:text-3xl font-bold rounded-xl border-2 transition-all outline-none ${
                digit
                  ? 'border-orange-500 bg-orange-50/20 text-orange-600'
                  : 'border-gray-200 bg-gray-50 text-gray-900'
              } focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:opacity-50`}
            />
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <p className="text-sm md:text-base text-red-500 text-center mb-4">{error}</p>
        )}

        {/* Verify Button */}
        <button
          onClick={() => handleVerifyOTP()}
          disabled={isVerifying}
          className={`w-full py-3 sm:py-4 md:py-5 rounded-xl font-bold text-base md:text-lg shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all mb-6 sm:mb-8 md:mb-8 ${
            isVerifying
              ? 'bg-gray-400 cursor-not-allowed text-white'
              : 'bg-orange-500 text-white hover:bg-orange-600'
          }`}
        >
          {isVerifying ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Verifying...
            </span>
          ) : (
            'Verify & Continue'
          )}
        </button>

        {/* Resend OTP */}
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-2">
            Didn't receive the code?
          </p>
          <button
            onClick={handleResendOTP}
            disabled={resendTimer > 0}
            className={`text-sm font-semibold transition-colors ${
              resendTimer > 0
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-orange-500 hover:text-orange-600'
            }`}
          >
            {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default OTP;
