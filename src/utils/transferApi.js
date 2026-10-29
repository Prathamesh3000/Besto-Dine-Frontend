// API wrappers for inter-branch stock transfers + inventory valuation.
// Kept out of utils/api.js so that shared file is untouched.
import api from './api'

export const transferAPI = {
    list: (params) => api.get('/inventory/transfers', { params }),
    create: (data) => api.post('/inventory/transfers', data),
    get: (id) => api.get(`/inventory/transfers/${id}`),
    send: (id) => api.post(`/inventory/transfers/${id}/send`),
    receive: (id, data) => api.post(`/inventory/transfers/${id}/receive`, data || {}),
    cancel: (id) => api.post(`/inventory/transfers/${id}/cancel`),
    valuation: (params) => api.get('/inventory/reports/valuation', { params }),
    branches: () => api.get('/branches'),
    items: (branch) => api.get('/inventory', { params: { branch, limit: 500 } }),
}
