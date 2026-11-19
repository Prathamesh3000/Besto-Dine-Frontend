import api from './api';

// Super Admin → Team (platform staff). Backend: /api/v1/superadmin/platform-staff
// (see PLATFORM_STAFF_PLAN.md). Full super admins only.
export const platformStaffAPI = {
    modules:       ()           => api.get('/superadmin/platform-staff/modules'),
    list:          ()           => api.get('/superadmin/platform-staff'),
    get:           (id)         => api.get(`/superadmin/platform-staff/${id}`),
    create:        (body)       => api.post('/superadmin/platform-staff', body),
    update:        (id, body)   => api.patch(`/superadmin/platform-staff/${id}`, body),
    resetPassword: (id)         => api.post(`/superadmin/platform-staff/${id}/reset-password`),
    activity:      (id, params) => api.get(`/superadmin/platform-staff/${id}/activity`, { params }),
};

export default platformStaffAPI;
