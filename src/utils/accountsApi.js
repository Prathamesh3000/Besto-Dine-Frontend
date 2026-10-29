// API wrappers for the Accounts pages (cash closing, supplier invoices, ledger).
// Kept out of utils/api.js so that shared file is untouched.
import api from './api'

const quiet = { _silent: true }

export const cashClosingAPI = {
    preview: (params) => api.get('/cash-closings/preview', { params, ...quiet }),
    list: (params) => api.get('/cash-closings', { params, ...quiet }),
    open: (data) => api.post('/cash-closings/open', data, quiet),
    close: (data) => api.post('/cash-closings/close', data, quiet),
    amend: (id, data) => api.patch(`/cash-closings/${id}`, data, quiet),
}

export const expenseAPI = {
    list: (params) => api.get('/ledger/expenses', { params, ...quiet }),
    create: (data) => api.post('/ledger/expenses', data, quiet),
    void: (id, reason) => api.post(`/ledger/expenses/${id}/void`, { reason }, quiet),
}

export const supplierInvoiceAPI = {
    list: (params) => api.get('/supplier-invoices', { params, ...quiet }),
    create: (data) => api.post('/supplier-invoices', data, quiet),
    pay: (id, data) => api.post(`/supplier-invoices/${id}/payments`, data, quiet),
    outstanding: (params) => api.get('/supplier-invoices/reports/outstanding', { params, ...quiet }),
    threeWay: (params) => api.get('/supplier-invoices/reports/three-way-match', { params, ...quiet }),
    suppliers: () => api.get('/suppliers', { params: { active: 'true' }, ...quiet }),
}

export const ledgerAPI = {
    trialBalance: (params) => api.get('/ledger/trial-balance', { params, ...quiet }),
    pnl: (params) => api.get('/ledger/pnl', { params, ...quiet }),
    accountLedger: (code, params) => api.get(`/ledger/accounts/${code}/ledger`, { params, ...quiet }),
    postDay: (data) => api.post('/ledger/post-day', data, quiet),
}

// Pure helpers shared by the pages (and unit-tested).
export const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const errMsg = (err, fallback) => err?.response?.data?.message || fallback
export const todayYmd = () => new Date().toLocaleDateString('en-CA')
/** Client-side mirror of the server's cash maths, for the live variance preview. */
export const cashVariance = (expected, counted) => {
    if (counted === '' || counted === null || counted === undefined || !Number.isFinite(Number(counted))) return null
    return Math.round((Number(counted) - Number(expected || 0)) * 100) / 100
}
