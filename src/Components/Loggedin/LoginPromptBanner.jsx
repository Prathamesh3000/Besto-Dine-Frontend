import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../Context/AuthContext';
import BannerImage from '/Ad.png'; // Updated to user provided Ad image
import BgImage from '/bgAd.png'; // Background Image

const LoginPromptBanner = () => {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();

  // Don't show if user is already logged in
  if (isLoggedIn) return null;

  return (
    <div className=" w-full">
      <div
        className="relative rounded-2xl py-6 px-4 md:p-8 flex items-center overflow-hidden shadow-sm border border-orange-50 bg-cover bg-center bg-no-repeat min-h-[150px]"
        style={{ backgroundImage: `url(${BgImage})` }}
      >
        {/* ✅ Color Overlay */}
        <div className="absolute inset-0 bg-[#F8EFE9] opacity-80"></div>

        {/* Left Content */}
        {/* Copy column sits ABOVE the artwork (z-20) and is narrow enough
            that the artwork never lands on top of the text. The heading
            used to be whitespace-nowrap at 22px, so on a 360px phone it
            ran past its column and the promo image was drawn over the
            "Log in to unlock…" message. */}
        <div className="relative z-20 w-[60%] sm:w-[58%]">
          <h2
            style={{ fontWeight: 700 }}
            className="text-[19px] min-[400px]:text-[21px] md:text-2xl nunito font-bold text-[#EF7B00] leading-tight"
          >
            Chaat That Hits Different
          </h2>

          <p className="text-[#645E66] text-[13px] varela-rounded md:text-[14px] leading-snug pb-3 pt-1 font-normal">
            Log in to unlock exclusive deals & easy ordering
          </p>

          <button
            onClick={() => navigate('/login')}
            className="bg-[#EF7B00] hover:bg-orange-600 text-[#FFFFFF]  nunito text-[14px] md:text-base font-semibold px-5 py-2 rounded-[10px] shadow-md active:scale-95 transition-all"
          >
            Log In Now
          </button>
        </div>

        {/* Right Image - Anchored exactly to bottom right */}
        <div className="pointer-events-none absolute bottom-0 right-0 w-[42%] sm:w-[40%] md:w-[38%] max-w-[280px] z-0 flex items-end justify-end">
          <img
            src={BannerImage}
            alt="Delicious Chaat"
            loading="lazy"
            decoding="async"
            className="w-full h-auto object-contain translate-x-1 translate-y-1 drop-shadow-xl"
          />
        </div>
      </div>
    </div>
  );
};

export default LoginPromptBanner;