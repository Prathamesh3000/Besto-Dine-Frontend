import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../Context/AuthContext';

const Unauthorized = () => {
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const handleGoBack = () => {
        navigate(-1);
    };

    const handleGoHome = () => {
        if (user?.role === 'customer') {
            navigate('/customer/home');
        } else if (user?.role === 'waiter' || user?.role === 'captain') {
            navigate('/waiter/home');
        } else {
            navigate('/login');
        }
    };

    const handleLogout = () => {
        const isStaff = ['waiter', 'captain', 'chef', 'admin'].includes(user?.role);
        logout();
        navigate(isStaff ? '/staff-login' : '/login');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
            <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 max-w-md w-full text-center">
                {/* Icon */}
                <div className="w-24 h-24 bg-gradient-to-br from-red-500 to-orange-500 rounded-full mx-auto mb-6 flex items-center justify-center">
                    <svg
                        className="w-12 h-12 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                    </svg>
                </div>

                {/* Title */}
                <h1 className="text-3xl font-bold text-gray-800 mb-3">
                    Access Denied
                </h1>

                {/* Message */}
                <p className="text-gray-600 mb-2">
                    You don't have permission to access this page.
                </p>
                {user && (
                    <p className="text-sm text-gray-500 mb-8">
                        Current role: <span className="font-semibold capitalize">{user.role}</span>
                    </p>
                )}

                {/* Actions */}
                <div className="space-y-3">
                    <button
                        onClick={handleGoHome}
                        className="w-full bg-gradient-to-r from-[#FF6B6B] to-[#FF8E8E] text-white font-bold py-3 px-6 rounded-xl hover:shadow-lg transform hover:scale-[1.02] transition-all"
                    >
                        Go to Home
                    </button>

                    <button
                        onClick={handleGoBack}
                        className="w-full bg-gray-100 text-gray-700 font-semibold py-3 px-6 rounded-xl hover:bg-gray-200 transition-all"
                    >
                        Go Back
                    </button>

                    <button
                        onClick={handleLogout}
                        className="w-full border border-gray-300 text-gray-600 font-semibold py-3 px-6 rounded-xl hover:bg-gray-50 transition-all"
                    >
                        Logout
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Unauthorized;
