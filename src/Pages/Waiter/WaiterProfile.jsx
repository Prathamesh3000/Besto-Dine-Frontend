import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, User, Phone, Mail, Shield, Loader2, Camera, Building2, LogOut } from 'lucide-react';
import { useAuth } from '../../Context/AuthContext';
import api from '../../utils/api';
import { resolveImageUrl } from '../../utils/image';
import toast from 'react-hot-toast';

const fallbackAvatar = (name) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Staff')}&background=702083&color=fff&size=192`;

const WaiterProfile = () => {
    const navigate = useNavigate();
    const { user, updateProfile, logout } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [profile, setProfile] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [form, setForm] = useState({ name: '', mobile: '', email: '' });
    const fileInputRef = useRef(null);

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const res = await api.get('/auth/me');
            if (res.data) {
                const data = res.data.user || res.data;
                setProfile(data);
                setForm({ name: data.name || '', mobile: data.mobile || '', email: data.email || '' });
            }
        } catch (err) {
            console.error('Failed to fetch profile:', err);
        } finally {
            setLoading(false);
        }
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
                setProfile((prev) => ({ ...prev, avatar: res.data.user.avatar }));
                updateProfile({ avatar: res.data.user.avatar });
                toast.success('Avatar updated');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to upload avatar');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await api.put('/auth/profile', {
                name: form.name,
                mobile: form.mobile,
            });
            if (res.data) {
                const updated = res.data.user || res.data;
                setProfile(updated);
                updateProfile({ name: updated.name, mobile: updated.mobile });
                toast.success('Profile updated');
                setIsEditing(false);
            }
        } catch (err) {
            console.error('Failed to update profile:', err);
            toast.error('Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    // WAI-030 — sign-out from the profile page. AuthContext.logout()
    // already clears localStorage, disconnects sockets, and broadcasts
    // the cross-tab logout signal — we just navigate to the staff login
    // page so the user lands on a sensible next screen.
    const handleLogout = async () => {
        try {
            await api.post('/auth/logout').catch(() => { /* best-effort server-side */ });
        } finally {
            logout();
            navigate('/staff-login', { replace: true });
        }
    };

    // Display-friendly branch label. The /auth/me payload may carry
    // `branch` as a populated `{ _id, name, slug }` object, a bare ID,
    // or null for tenant-level staff (e.g. an unpinned Manager).
    const branchLabel = (() => {
        const b = profile?.branch;
        if (!b) return 'All Branches';
        if (typeof b === 'object') return b.name || b.slug || '—';
        return String(b).slice(0, 8) + '…';
    })();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FBFBFF] pb-10">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <header className="px-4 sm:px-6 pt-6 pb-4 flex items-center gap-3 bg-white/95 backdrop-blur sticky top-0 z-10 shadow-sm">
                    <button
                        onClick={() => navigate(-1)}
                        aria-label="Back"
                        className="w-11 h-11 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-50 flex items-center justify-center transition shrink-0"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <h1 className="text-xl sm:text-2xl font-bold text-[#1A181B] tracking-tight">My Profile</h1>
                </header>

                <main className="px-4 sm:px-6 py-5 space-y-5">
                {/* Avatar Section */}
                <div className="flex flex-col items-center mb-6">
                    <div className="relative">
                        <div className="w-[96px] h-[96px] bg-[#E0E0E0] rounded-[32px] flex items-center justify-center overflow-hidden">
                            <img
                                src={resolveImageUrl(profile?.avatar) || fallbackAvatar(profile?.name)}
                                alt="Avatar"
                                className="w-full h-full object-cover"
                                onError={(e) => { e.target.onerror = null; e.target.src = fallbackAvatar(profile?.name); }}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            aria-label="Change profile picture"
                            className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-[#FE8301] text-white flex items-center justify-center shadow-md active:scale-95 transition-all disabled:opacity-60"
                        >
                            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarUpload}
                            className="hidden"
                        />
                    </div>
                    <h2 className="text-[20px] font-bold text-[#1A181B] mt-3 capitalize">{profile?.name || 'Staff'}</h2>
                    <div className="flex items-center gap-2 mt-1">
                        <Shield size={14} className="text-[#702083]" />
                        <span className="text-[14px] text-[#702083] font-medium capitalize">{profile?.role || 'Waiter'}</span>
                    </div>
                    {profile?.staffId && (
                        <span className="text-[12px] text-[#8D848F] mt-1 font-medium">ID: {profile.staffId}</span>
                    )}
                </div>

                {/* Profile Card */}
                <div className="bg-white rounded-[24px] border border-[#EBEBEB] p-[16px] shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[18px] font-bold text-[#1A181B]">Personal Details</h3>
                        {!isEditing ? (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="text-[14px] font-[600] text-[#FE8301] active:opacity-70"
                            >
                                Edit
                            </button>
                        ) : (
                            <button
                                onClick={() => { setIsEditing(false); setForm({ name: profile?.name || '', mobile: profile?.mobile || '', email: profile?.email || '' }); }}
                                className="text-[14px] font-[600] text-[#8D848F] active:opacity-70"
                            >
                                Cancel
                            </button>
                        )}
                    </div>

                    {/* Name */}
                    <div className="mb-4">
                        <label className="text-[12px] font-[500] text-[#8D848F] mb-1 block">Full Name</label>
                        {isEditing ? (
                            <input
                                type="text"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                className="w-full p-3 border border-[#CCCAC8] rounded-[12px] text-[14px] text-[#1A181B] outline-none focus:border-[#702083]"
                            />
                        ) : (
                            <div className="flex items-center gap-3 p-3 bg-[#F9FAFB] rounded-[12px]">
                                <User size={18} className="text-[#8D848F]" />
                                <span className="text-[14px] text-[#1A181B] font-[500] capitalize">{profile?.name || '—'}</span>
                            </div>
                        )}
                    </div>

                    {/* Phone */}
                    <div className="mb-4">
                        <label className="text-[12px] font-[500] text-[#8D848F] mb-1 block">Phone Number</label>
                        {isEditing ? (
                            <input
                                type="tel"
                                value={form.mobile}
                                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                                className="w-full p-3 border border-[#CCCAC8] rounded-[12px] text-[14px] text-[#1A181B] outline-none focus:border-[#702083]"
                            />
                        ) : (
                            <div className="flex items-center gap-3 p-3 bg-[#F9FAFB] rounded-[12px]">
                                <Phone size={18} className="text-[#8D848F]" />
                                <span className="text-[14px] text-[#1A181B] font-[500]">{profile?.mobile || '—'}</span>
                            </div>
                        )}
                    </div>

                    {/* Email (read-only) */}
                    <div className="mb-4">
                        <label className="text-[12px] font-[500] text-[#8D848F] mb-1 block">Email</label>
                        <div className="flex items-center gap-3 p-3 bg-[#F9FAFB] rounded-[12px]">
                            <Mail size={18} className="text-[#8D848F]" />
                            <span className="text-[14px] text-[#1A181B] font-[500]">{profile?.email || '—'}</span>
                        </div>
                    </div>

                    {/* Save Button */}
                    {isEditing && (
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className={`w-full rounded-[12px] py-[12px] text-[14px] font-[600] transition-all active:scale-[0.98] ${saving ? 'bg-gray-300 cursor-not-allowed text-gray-500' : 'bg-[#FE8301] text-white'}`}
                        >
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    )}
                </div>

                {/* Stats Card */}
                <div className="bg-white rounded-[24px] border border-[#EBEBEB] p-[16px] shadow-sm mt-4">
                    <h3 className="text-[18px] font-bold text-[#1A181B] mb-3">Account Info</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center py-2 border-b border-[#F5F5F5]">
                            <span className="text-[14px] text-[#8D848F] font-[500]">Role</span>
                            <span className="text-[14px] text-[#1A181B] font-[600] capitalize">{profile?.role || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-[#F5F5F5]">
                            <span className="text-[14px] text-[#8D848F] font-[500]">Staff ID</span>
                            <span className="text-[14px] text-[#1A181B] font-[600]">{profile?.staffId || '—'}</span>
                        </div>
                        {/* WAI-030 — branch the waiter is pinned to so they always
                            know which location they're working at. */}
                        <div className="flex justify-between items-center py-2 border-b border-[#F5F5F5]">
                            <span className="text-[14px] text-[#8D848F] font-[500] flex items-center gap-1.5">
                                <Building2 size={14} className="text-[#702083]" />
                                Branch
                            </span>
                            <span className="text-[14px] text-[#1A181B] font-[600] truncate max-w-[60%] text-right" title={branchLabel}>
                                {branchLabel}
                            </span>
                        </div>
                        <div className="flex justify-between items-center py-2">
                            <span className="text-[14px] text-[#8D848F] font-[500]">Status</span>
                            <span className={`text-[12px] font-bold px-[8px] py-[4px] rounded-[8px] ${profile?.status === 'active' ? 'bg-[#E8F5E9] text-[#22C55E]' : 'bg-[#FFF3E0] text-[#FE8301]'}`}>
                                {profile?.status === 'active' ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* WAI-030 — Log Out. Distinct red button so the sign-out
                    action is unambiguous. Sits below the account card so the
                    waiter scrolls to it (avoids an accidental tap). */}
                <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full mt-4 flex items-center justify-center gap-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 active:scale-[0.98] rounded-[16px] py-3 text-[14px] font-bold transition"
                >
                    <LogOut size={16} strokeWidth={2.4} />
                    Log Out
                </button>
                </main>
            </div>
        </div>
    );
};

export default WaiterProfile;
