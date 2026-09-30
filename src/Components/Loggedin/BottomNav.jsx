import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../Context/AuthContext';
import { useHealthContext as useHealth } from '../../Context/Loggedin/HealthContext';
// Icons are all flaticon strings now — no lucide imports needed

function BottomNav() {
  const { t } = useTranslation();
  const { isLoggedIn, isGuest } = useAuth();
  const { healthMode } = useHealth();

  const navItems = [
    {
      path: '/customer/home',
      label: t('nav.home'),
      icon: 'fi fi-sr-home',
    },
    {
      path: '/customer/menu',
      label: t('nav.menu'),
      icon: 'fi fi-sr-restaurant',
    },
    {
      path: '/customer/orders',
      label: t('nav.order'),
      icon: 'fi fi-sr-plate-utensils',
    },
    // Guest users get a Bill tab; logged-in users get a Profile tab
    ...(isGuest
      ? [{ path: '/customer/bill', label: t('nav.bill'), icon: 'fi fi-sr-receipt' }]
      : isLoggedIn
        ? [{ path: '/customer/profile', label: t('nav.profile'), icon: 'fi fi-sr-user' }]
        : []),
  ];

  // Specific colors extracted from your Figma screenshot
  const activeClass = healthMode
    ? 'text-green-600 bg-green-50'
    : 'text-orange-500 bg-orange-50'; // Orange text + Light Orange Background

  const inactiveClass = 'text-gray-500 hover:bg-gray-50';

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 w-full bg-white border-t border-gray-100 flex justify-around items-center px-4 sm:px-6 md:px-16 lg:px-[300px] xl:px-[300px] pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] transition-colors duration-200"
      style={{ WebkitBackfaceVisibility: 'hidden' }}
    >
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 flex-1 min-w-0 max-w-[80px] h-14 md:h-16 rounded-2xl transition-all duration-200 touch-manipulation ${isActive ? activeClass : inactiveClass}`
          }
        >
          {({ isActive }) => (
            <>
              {typeof item.icon === 'string' ? (
                <i className={`${item.icon} text-[22px] md:text-[26px] leading-none`} />
              ) : (
                <item.icon
                  size={22}
                  className="md:w-7 md:h-7"
                  strokeWidth={isActive ? 2.5 : 2}
                />
              )}
              <span className={`text-[11px] md:text-xs font-nunito font-semibold leading-none truncate w-full text-center px-1`}>
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export default BottomNav;