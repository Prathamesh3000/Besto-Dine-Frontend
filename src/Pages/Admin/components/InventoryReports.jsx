import React, { useState, useEffect, useCallback } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { inventoryAPI, purchaseAPI } from '../../../utils/api'
import { exportReportToExcel, reportStamp } from '../../../utils/exportReport'

const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const REPORTS = [
    { id: 'stock', label: 'Opening & Closing Stock' },
    { id: 'consumption', label: 'Consumption' },
    { id: 'purchase', label: 'Purchase' },
    { id: 'payments', label: 'Supplier Payments' },
]

const InventoryReports = () => {
    const [active, setActive] = useState('stock')
    const [days, setDays] = useState(30)
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(false)

    const load = useCallback(async () => {
        setLoading(true); setData(null)
        try {
            let res
            if (active === 'stock') res = await inventoryAPI.getStockReport({ days })
            else if (active === 'consumption') res = await inventoryAPI.getConsumptionReport({ days })
            else if (active === 'purchase') res = await purchaseAPI.purchaseReport({ days })
            else res = await purchaseAPI.paymentReport()
            setData(res.data)
        } catch { toast.error('Failed to load report') }
        finally { setLoading(false) }
    }, [active, days])
    useEffect(() => { load() }, [load])

    const handleExport = async () => {
        if (!data) { toast.error('Nothing to export yet'); return }
        const stamp = reportStamp()
        const windowMeta = active !== 'payments' ? [{ label: 'Window', value: `Last ${days} days` }] : []
        const meta = [...windowMeta, { label: 'Generated', value: new Date().toLocaleString('en-IN') }]
        let cfg
        if (active === 'stock') {
            cfg = {
                filename: `stock-report-${stamp}.xlsx`, sheetName: 'Opening & Closing', title: 'Opening & Closing Stock Report',
                columns: [
                    { key: 'name', label: 'Item' }, { key: 'category', label: 'Category' },
                    { key: 'opening', label: 'Opening', numeric: true }, { key: 'received', label: 'Received', numeric: true },
                    { key: 'consumed', label: 'Consumed', numeric: true }, { key: 'closing', label: 'Closing', numeric: true },
                    { key: 'unit', label: 'Unit' }, { key: 'closingValue', label: 'Closing Value', money: true },
                ],
                rows: data.report || [],
                totals: data.totals ? { name: 'TOTAL', closingValue: data.totals.closingValue } : null,
            }
        } else if (active === 'consumption') {
            cfg = {
                filename: `consumption-report-${stamp}.xlsx`, sheetName: 'Consumption', title: 'Consumption Report',
                columns: [
                    { key: 'name', label: 'Item' }, { key: 'unit', label: 'Unit' },
                    { key: 'usage', label: 'Usage', numeric: true }, { key: 'waste', label: 'Wastage', numeric: true },
                    { key: 'cost', label: 'Cost', money: true },
                ],
                rows: data.byItem || [],
                totals: { name: 'TOTAL', cost: data.totalCost },
            }
        } else if (active === 'purchase') {
            cfg = {
                filename: `purchase-report-${stamp}.xlsx`, sheetName: 'Purchase', title: 'Purchase Report',
                columns: [
                    { key: 'supplierName', label: 'Supplier' }, { key: 'poCount', label: 'POs', numeric: true },
                    { key: 'totalSpend', label: 'Total Spend', money: true }, { key: 'paid', label: 'Paid', money: true },
                    { key: 'outstanding', label: 'Outstanding', money: true },
                ],
                rows: data.report || [],
                totals: data.totals ? { supplierName: 'TOTAL', totalSpend: data.totals.totalSpend, paid: data.totals.paid, outstanding: data.totals.outstanding } : null,
            }
        } else {
            cfg = {
                filename: `supplier-payments-${stamp}.xlsx`, sheetName: 'Supplier Payments', title: 'Supplier Payments Report',
                columns: [
                    { key: 'supplierName', label: 'Supplier' }, { key: 'unpaidPOs', label: 'Unpaid POs', numeric: true },
                    { key: 'oldest', label: 'Oldest Due' }, { key: 'outstanding', label: 'Outstanding', money: true },
                ],
                rows: (data.report || []).map(r => ({ ...r, oldest: r.oldest ? new Date(r.oldest).toLocaleDateString('en-IN') : '—' })),
                totals: { supplierName: 'TOTAL', outstanding: data.totalOutstanding },
            }
        }
        try { await exportReportToExcel({ ...cfg, meta }); toast.success('Report exported') }
        catch { toast.error('Export failed') }
    }

    const Th = ({ children, right }) => <th className={`px-4 py-3 text-[11px] uppercase text-gray-400 font-semibold ${right ? 'text-right' : 'text-left'}`}>{children}</th>
    const Td = ({ children, right, className = '' }) => <td className={`px-4 py-2.5 ${right ? 'text-right' : ''} ${className}`}>{children}</td>

    return (
        <div>
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 p-1 w-fit">
                    {REPORTS.map(r => (
                        <button key={r.id} onClick={() => setActive(r.id)} className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg ${active === r.id ? 'bg-[#FE8301] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>{r.label}</button>
                    ))}
                </div>
                <div className="flex items-center gap-2 text-sm">
                    {active !== 'payments' && (
                        <>
                            <span className="text-gray-400">Window</span>
                            <select value={days} onChange={e => setDays(Number(e.target.value))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#FE8301]">
                                {[7, 15, 30, 60, 90, 180, 365].map(d => <option key={d} value={d}>Last {d} days</option>)}
                            </select>
                        </>
                    )}
                    <button onClick={handleExport} disabled={loading || !data} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-[#FE8301] disabled:opacity-50">
                        <Download size={15} /> Export Excel
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="py-16 text-center text-gray-400 text-sm">Loading report…</div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    {/* Stock report */}
                    {active === 'stock' && (
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50"><tr><Th>Item</Th><Th>Category</Th><Th right>Opening</Th><Th right>Received</Th><Th right>Consumed</Th><Th right>Closing</Th><Th right>Value</Th></tr></thead>
                            <tbody>
                                {(data?.report || []).map((r, i) => (
                                    <tr key={i} className="border-t border-gray-50">
                                        <Td className="font-medium text-gray-800">{r.name}</Td>
                                        <Td className="text-gray-500 text-[12px]">{r.category}</Td>
                                        <Td right className="text-gray-600">{r.opening} {r.unit}</Td>
                                        <Td right className="text-emerald-600">{r.received ? `+${r.received}` : '—'}</Td>
                                        <Td right className="text-rose-500">{r.consumed ? `-${r.consumed}` : '—'}</Td>
                                        <Td right className="font-semibold text-gray-800">{r.closing} {r.unit}</Td>
                                        <Td right className="text-gray-600">{money(r.closingValue)}</Td>
                                    </tr>
                                ))}
                                {data?.report?.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-gray-400 text-sm">No items.</td></tr>}
                            </tbody>
                            {data?.totals && <tfoot><tr className="border-t border-gray-100 bg-gray-50/50 font-semibold"><td colSpan={6} className="px-4 py-3 text-right text-gray-500">Total closing value</td><td className="px-4 py-3 text-right text-gray-800">{money(data.totals.closingValue)}</td></tr></tfoot>}
                        </table>
                    )}

                    {/* Consumption report */}
                    {active === 'consumption' && (
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50"><tr><Th>Item</Th><Th right>Usage</Th><Th right>Wastage</Th><Th right>Cost</Th></tr></thead>
                            <tbody>
                                {(data?.byItem || []).map((r, i) => (
                                    <tr key={i} className="border-t border-gray-50">
                                        <Td className="font-medium text-gray-800">{r.name}</Td>
                                        <Td right className="text-gray-600">{r.usage} {r.unit}</Td>
                                        <Td right className="text-rose-500">{r.waste ? `${r.waste} ${r.unit}` : '—'}</Td>
                                        <Td right className="font-semibold text-gray-700">{money(r.cost)}</Td>
                                    </tr>
                                ))}
                                {data?.byItem?.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-gray-400 text-sm">No consumption in this window.</td></tr>}
                            </tbody>
                            {data && <tfoot><tr className="border-t border-gray-100 bg-gray-50/50 font-semibold"><td colSpan={3} className="px-4 py-3 text-right text-gray-500">Total consumption cost</td><td className="px-4 py-3 text-right text-gray-800">{money(data.totalCost)}</td></tr></tfoot>}
                        </table>
                    )}

                    {/* Purchase report */}
                    {active === 'purchase' && (
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50"><tr><Th>Supplier</Th><Th right>POs</Th><Th right>Total Spend</Th><Th right>Paid</Th><Th right>Outstanding</Th></tr></thead>
                            <tbody>
                                {(data?.report || []).map((r, i) => (
                                    <tr key={i} className="border-t border-gray-50">
                                        <Td className="font-medium text-gray-800">{r.supplierName}</Td>
                                        <Td right className="text-gray-600">{r.poCount}</Td>
                                        <Td right className="font-semibold text-gray-800">{money(r.totalSpend)}</Td>
                                        <Td right className="text-emerald-600">{money(r.paid)}</Td>
                                        <Td right className="text-rose-600">{money(r.outstanding)}</Td>
                                    </tr>
                                ))}
                                {data?.report?.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-gray-400 text-sm">No purchases in this window.</td></tr>}
                            </tbody>
                            {data?.totals && <tfoot><tr className="border-t border-gray-100 bg-gray-50/50 font-semibold"><td className="px-4 py-3 text-gray-500">Total</td><td></td><td className="px-4 py-3 text-right text-gray-800">{money(data.totals.totalSpend)}</td><td className="px-4 py-3 text-right text-emerald-600">{money(data.totals.paid)}</td><td className="px-4 py-3 text-right text-rose-600">{money(data.totals.outstanding)}</td></tr></tfoot>}
                        </table>
                    )}

                    {/* Supplier payments report */}
                    {active === 'payments' && (
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50"><tr><Th>Supplier</Th><Th right>Unpaid POs</Th><Th>Oldest due</Th><Th right>Outstanding</Th></tr></thead>
                            <tbody>
                                {(data?.report || []).map((r, i) => (
                                    <tr key={i} className="border-t border-gray-50">
                                        <Td className="font-medium text-gray-800">{r.supplierName}</Td>
                                        <Td right className="text-gray-600">{r.unpaidPOs}</Td>
                                        <Td className="text-gray-500 text-[12px]">{r.oldest ? new Date(r.oldest).toLocaleDateString('en-IN') : '—'}</Td>
                                        <Td right className="font-semibold text-rose-600">{money(r.outstanding)}</Td>
                                    </tr>
                                ))}
                                {data?.report?.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-gray-400 text-sm">No outstanding supplier dues. 🎉</td></tr>}
                            </tbody>
                            {data && <tfoot><tr className="border-t border-gray-100 bg-gray-50/50 font-semibold"><td colSpan={3} className="px-4 py-3 text-right text-gray-500">Total outstanding</td><td className="px-4 py-3 text-right text-rose-600">{money(data.totalOutstanding)}</td></tr></tfoot>}
                        </table>
                    )}
                </div>
            )}
        </div>
    )
}

export default InventoryReports
