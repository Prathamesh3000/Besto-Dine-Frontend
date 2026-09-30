import { useNavigate } from 'react-router-dom';
import { useAuth } from '../Context/AuthContext';

/**
 * useRoleNavigation
 *
 * Centralised hook for role-aware navigation so no component
 * needs to hard-code role checks + paths.
 *
 * Route map:
 *   waiter / captain  →  /waiter/*
 *   customer          →  /customer/*
 *   guest             →  /customer/*  (browse only)
 */
export const useRoleNavigation = () => {
    const navigate = useNavigate();
    const { user, isGuest, isWaiter, isCaptain, isStaff, isCustomer } = useAuth();

    // Called right after login / skip to send user to the right home
    const navigateAfterLogin = () => {
        if (isStaff) {
            navigate('/waiter/home', { replace: true });
        } else {
            // customer or guest
            navigate('/customer/home', { replace: true });
        }
    };

    const navigateToHome = () => {
        if (isStaff) navigate('/waiter/home');
        else navigate('/customer/home');
    };

    const navigateToMenu = () => {
        if (isStaff) navigate('/waiter/menu');
        else navigate('/customer/menu');
    };

    const navigateToCart = () => {
        if (isStaff) navigate('/waiter/cart');
        else navigate('/customer/cart');
    };

    const navigateToOrders = () => {
        if (isStaff) navigate('/waiter/orders');
        else navigate('/customer/orders');
    };

    const navigateToSearch = () => {
        navigate('/customer/search');
    };

    const navigateToBookingType = () => {
        navigate('/customer/booking-type');
    };

    const navigateToBookTableDetails = () => {
        navigate('/customer/book-table-details');
    };

    const navigateToAddOns = () => {
        navigate('/customer/add-ons');
    };

    const navigateToParkingDetails = () => {
        navigate('/customer/parking-details');
    };

    const navigateToCakeDetails = () => {
        navigate('/customer/cake-details');
    };

    return {
        navigateAfterLogin,
        navigateToHome,
        navigateToMenu,
        navigateToCart,
        navigateToOrders,
        navigateToSearch,
        navigateToBookingType,
        navigateToBookTableDetails,
        navigateToAddOns,
        navigateToParkingDetails,
        navigateToCakeDetails,
        navigate,          // raw navigate for edge cases
        isStaff,
        isCaptain,
        isWaiter,
        isCustomer,
        isGuest,
        role: user?.role ?? null,
    };
};

export default useRoleNavigation;
