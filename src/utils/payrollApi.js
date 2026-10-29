import api from './api'

// Simple payroll (attendance + wallet payout; not statutory payroll). Admin / owner only.
const opts = { _silent: true, _skipAdminBranchParam: true }

export const payrollAPI = {
    listProfiles: () => api.get('/payroll/profiles', opts),
    saveProfile: (staffId, data) => api.put(`/payroll/profiles/${staffId}`, data, { _silent: true }),
    listRuns: () => api.get('/payroll/runs', opts),
    getRun: (id) => api.get(`/payroll/runs/${id}`, opts),
    createRun: (data) => api.post('/payroll/runs', data, { _silent: true }),
    saveAdjustments: (id, adjustments) => api.put(`/payroll/runs/${id}/adjustments`, { adjustments }, { _silent: true }),
    finalize: (id) => api.post(`/payroll/runs/${id}/finalize`, {}, { _silent: true }),
    pay: (id, data) => api.post(`/payroll/runs/${id}/pay`, data, { _silent: true }),
    exportCsv: (id) => api.get(`/payroll/runs/${id}/export.csv`, { responseType: 'blob', ...opts }),
    getPayslip: (id, staffId) => api.get(`/payroll/runs/${id}/payslip/${staffId}`, opts),
}

export const apiMessage = (err, fallback = 'Something went wrong') =>
    err?.response?.data?.message || err?.message || fallback
