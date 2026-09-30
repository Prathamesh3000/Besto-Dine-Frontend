import React from 'react';
import { useAuth } from '../Context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useRoleNavigation } from '../hooks/useRoleNavigation';
import { LogOut, User, Shield, CheckCircle, XCircle } from 'lucide-react';

/**
 * AuthDemo Component
 * 
 * This is a demo component showing how to use all authentication features.
 * Use this component as a reference when implementing auth in your own components.
 * 
 * To use this demo:
 * 1. Add route in App.jsx: <Route path="/auth-demo" element={<AuthDemo />} />
 * 2. Navigate to http://localhost:5173/auth-demo
 */
const AuthDemo = () => {
    const {
        user,
        isAuthenticated,
        hasRole,
        hasPermission,
        getUserPermissions,
        logout,
    } = useAuth();

    const navigate = useNavigate();
    const { navigateToHome, navigateToMenu, navigateToCart } = useRoleNavigation();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl shadow-lg p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                        <Shield className="w-8 h-8 text-red-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800 mb-2">Not Authenticated</h1>
                    <p className="text-gray-600 mb-6">Please login to view this demo</p>
                    <button
                        onClick={() => navigate('/login')}
                        className="w-full bg-gradient-to-r from-[#FF6B6B] to-[#FF8E8E] text-white font-bold py-3 px-6 rounded-xl hover:shadow-lg transition-all"
                    >
                        Go to Login
                    </button>
                </div>
            </div>
        );
    }

    const permissions = getUserPermissions();
    const permissionEntries = Object.entries(permissions);

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="bg-white rounded-3xl shadow-lg p-6 md:p-8 mb-6">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                                <User className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-800">Authentication Demo</h1>
                                <p className="text-gray-600">Testing auth features in action</p>
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition-all"
                        >
                            <LogOut className="w-5 h-5" />
                            Logout
                        </button>
                    </div>
                </div>

                {/* User Info Card */}
                <div className="bg-white rounded-3xl shadow-lg p-6 md:p-8 mb-6">
                    <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <User className="w-6 h-6 text-purple-600" />
                        Current User Information
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InfoItem label="Name" value={user?.name || 'N/A'} />
                        <InfoItem label="Email" value={user?.email || 'N/A'} />
                        <InfoItem
                            label="Role"
                            value={user?.role || 'N/A'}
                            highlight={true}
                        />
                        <InfoItem
                            label="User ID"
                            value={user?.id || 'N/A'}
                        />
                    </div>
                </div>

                {/* Role Checks Card */}
                <div className="bg-white rounded-3xl shadow-lg p-6 md:p-8 mb-6">
                    <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Shield className="w-6 h-6 text-purple-600" />
                        Role Checks
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <RoleCheck role="customer" hasRole={hasRole} />
                        <RoleCheck role="waiter" hasRole={hasRole} />
                        <RoleCheck role="captain" hasRole={hasRole} />
                        <RoleCheck role="admin" hasRole={hasRole} />
                    </div>
                </div>

                {/* Permissions Card */}
                <div className="bg-white rounded-3xl shadow-lg p-6 md:p-8 mb-6">
                    <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <CheckCircle className="w-6 h-6 text-purple-600" />
                        Your Permissions
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {permissionEntries.map(([permission, hasIt]) => (
                            <div
                                key={permission}
                                className={`flex items-center gap-3 p-3 rounded-xl border-2 ${hasIt
                                        ? 'bg-green-50 border-green-200'
                                        : 'bg-red-50 border-red-200'
                                    }`}
                            >
                                {hasIt ? (
                                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                                ) : (
                                    <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                                )}
                                <span
                                    className={`text-sm font-semibold ${hasIt ? 'text-green-800' : 'text-red-800'
                                        }`}
                                >
                                    {permission}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Navigation Demo Card */}
                <div className="bg-white rounded-3xl shadow-lg p-6 md:p-8 mb-6">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">
                        Role-Aware Navigation
                    </h2>
                    <p className="text-gray-600 mb-6">
                        These buttons automatically navigate to the correct route based on your role:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button
                            onClick={navigateToHome}
                            className="px-6 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:shadow-lg transition-all"
                        >
                            Go to Home
                        </button>
                        <button
                            onClick={navigateToMenu}
                            className="px-6 py-4 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold rounded-xl hover:shadow-lg transition-all"
                        >
                            Go to Menu
                        </button>
                        <button
                            onClick={navigateToCart}
                            className="px-6 py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-xl hover:shadow-lg transition-all"
                        >
                            Go to Cart
                        </button>
                    </div>
                </div>

                {/* Permission-Based Rendering Demo */}
                <div className="bg-white rounded-3xl shadow-lg p-6 md:p-8">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">
                        Permission-Based UI Rendering
                    </h2>
                    <p className="text-gray-600 mb-6">
                        These buttons only appear if you have the required permission:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {hasPermission('canTakeOrders') && (
                            <PermissionButton
                                label="Take Order"
                                description="Visible to waiters, captains, and admins"
                                color="purple"
                            />
                        )}
                        {hasPermission('canViewBills') && (
                            <PermissionButton
                                label="View Bills"
                                description="Visible to waiters, captains, and admins"
                                color="blue"
                            />
                        )}
                        {hasPermission('canProcessPayments') && (
                            <PermissionButton
                                label="Process Payment"
                                description="Visible to waiters, captains, and admins"
                                color="green"
                            />
                        )}
                        {hasPermission('canManageWaiters') && (
                            <PermissionButton
                                label="Manage Waiters"
                                description="Visible to captains and admins only"
                                color="orange"
                            />
                        )}
                        {hasPermission('canPlaceOrder') && (
                            <PermissionButton
                                label="Place Order"
                                description="Visible to customers and admins"
                                color="pink"
                            />
                        )}
                        {hasPermission('canManageSystem') && (
                            <PermissionButton
                                label="Manage System"
                                description="Visible to admins only"
                                color="red"
                            />
                        )}
                    </div>
                    {permissionEntries.filter(([, hasIt]) => hasIt).length === 0 && (
                        <p className="text-gray-500 text-center">
                            No special permissions available for your role
                        </p>
                    )}
                </div>

                {/* Back to App */}
                <div className="mt-6 text-center">
                    <button
                        onClick={() => navigate(-1)}
                        className="px-6 py-3 bg-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-300 transition-all"
                    >
                        ← Back to App
                    </button>
                </div>
            </div>
        </div>
    );
};

// Helper Components
const InfoItem = ({ label, value, highlight = false }) => (
    <div className="p-4 bg-gray-50 rounded-xl">
        <p className="text-sm text-gray-600 mb-1">{label}</p>
        <p className={`font-bold ${highlight ? 'text-purple-600 text-lg capitalize' : 'text-gray-800'}`}>
            {value}
        </p>
    </div>
);

const RoleCheck = ({ role, hasRole }) => {
    const isCurrentRole = hasRole(role);
    return (
        <div
            className={`p-4 rounded-xl text-center border-2 ${isCurrentRole
                    ? 'bg-purple-50 border-purple-300'
                    : 'bg-gray-50 border-gray-200'
                }`}
        >
            <p className="text-sm font-semibold text-gray-600 mb-2 capitalize">{role}</p>
            {isCurrentRole ? (
                <CheckCircle className="w-6 h-6 text-purple-600 mx-auto" />
            ) : (
                <XCircle className="w-6 h-6 text-gray-400 mx-auto" />
            )}
        </div>
    );
};

const PermissionButton = ({ label, description, color }) => {
    const colorClasses = {
        purple: 'from-purple-500 to-purple-600',
        blue: 'from-blue-500 to-blue-600',
        green: 'from-green-500 to-green-600',
        orange: 'from-orange-500 to-orange-600',
        pink: 'from-pink-500 to-pink-600',
        red: 'from-red-500 to-red-600',
    };

    return (
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <button
                className={`w-full px-4 py-3 bg-gradient-to-r ${colorClasses[color]} text-white font-bold rounded-lg hover:shadow-lg transition-all mb-2`}
            >
                {label}
            </button>
            <p className="text-xs text-gray-600">{description}</p>
        </div>
    );
};

export default AuthDemo;
