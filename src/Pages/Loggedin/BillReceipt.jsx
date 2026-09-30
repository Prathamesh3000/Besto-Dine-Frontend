import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { ChevronLeft, Loader2, Printer } from "lucide-react";
import api, { settingsAPI } from "../../utils/api";

const BillReceipt = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [receipt, setReceipt] = useState(location.state?.receipt || null);
  const [loading, setLoading] = useState(!receipt);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    // Fetch settings for cafe name/logo
    settingsAPI.getSettings().then(res => {
      if (res.data) setSettings(res.data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (receipt) return;

    // Try to get invoice from route state, or fetch from API
    const orderId = params.orderId || location.state?.orderId;
    if (!orderId) {
      // Fallback: try to load from the most recent invoice
      api.get('/invoices/my-invoices').then(res => {
        if (res.data?.success && res.data.invoices?.length > 0) {
          setReceipt(mapInvoice(res.data.invoices[0]));
        }
      }).catch(() => {}).finally(() => setLoading(false));
      return;
    }

    api.get(`/invoices/${orderId}`).then(res => {
      if (res.data?.success) {
        setReceipt(mapInvoice(res.data.invoice || res.data.data));
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [params.orderId, location.state?.orderId]);

  function mapInvoice(inv) {
    if (!inv) return null;
    return {
      // Prefer the friendly order ID (e.g. ORD-0001) populated from the order doc,
      // then the invoice number, then a placeholder. NEVER fall back to inv._id —
      // that would leak the raw 24-char Mongo id to the customer.
      orderId: inv.order?.orderId || inv.invoiceNumber || '—',
      tableNo: inv.tableNo || inv.table?.name || '—',
      items: (inv.items || []).map(i => ({
        name: i.name || i.menuItem,
        quantity: i.quantity || 1,
        price: i.price || 0,
      })),
      gst: inv.gst || 0,
      gstPct: inv.gstPercentage || 5,
      serviceCharge: inv.serviceCharge || 0,
      serviceChargePct: inv.serviceChargePercentage || 10,
      total: inv.total || inv.grandTotal || 0,
      paymentMethod: inv.paymentMethod || 'Cash',
    };
  }

  const cafeName = settings?.general?.cafeName || 'Cafe';
  const logoUrl = settings?.general?.logoUrl;
  const tableNo = receipt?.tableNo || '—';

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500 text-lg">No receipt found</p>
        <button onClick={() => navigate(-1)} className="text-orange-500 font-semibold">Go Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFFFF]-900 transition-colors duration-200 font-sans pb-32 flex flex-col relative print:pb-0 print:bg-white">
      <style>{`
        @media print {
          @page { margin: 12mm; }
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>
      {/* Header */}
      <header className="no-print fixed top-0 left-0 right-0 xl:left-[300px] xl:right-[300px] z-50 px-4 pt-6 pb-2 flex items-center justify-between sticky top-0 bg-[#FDFDFD]-900 z-10 w-full mb-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft size={24} className="text-[#666666]" />
          </button>
          <h1 className="text-[16px] font-normal nunito text-[#1A181B]">
            Order ID: {receipt.orderId}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-orange-600 hover:bg-orange-50 transition-colors text-[13px] font-medium"
            aria-label="Print receipt"
            title="Print receipt"
          >
            <Printer size={18} />
            <span className="hidden sm:inline">Print</span>
          </button>
          <span className="text-[#666666] font-regular varela-rounded text-[14px]">
            Table no.{tableNo}
          </span>
        </div>
      </header>

      <main className="px-4 relative z-10 flex-1 overflow-y-auto pb-24 flex flex-col items-center">
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-8 mt-2 text-center">
          {logoUrl ? (
            <div className="w-[88px] h-[88px] bg-white border border-gray-200 rounded-2xl mb-3 shadow-sm overflow-hidden p-2 flex items-center justify-center">
              <img
                src={logoUrl}
                alt="Logo"
                className="max-w-full max-h-full object-contain"
                onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
              />
            </div>
          ) : (
            <div className="w-[72px] h-[72px] bg-[#FF9B0B] rounded-full mb-3" />
          )}
          <span className="text-[20px] font-bold nunito text-[#101828]">
            {cafeName}
          </span>
          {settings?.general?.address && (
              <p className="text-[13px] text-[#645E66] mt-1 px-4 leading-relaxed">
                {settings.general.address}
              </p>
          )}
          {(settings?.general?.contactNumber || settings?.general?.email) && (
              <p className="text-[12px] text-[#8D848F] mt-1">
                {settings.general.contactNumber} {settings.general.contactNumber && settings.general.email && '| '}
                {settings.general.email}
              </p>
          )}
        </div>

        {/* Receipt Card */}
        <div className="bg-[#FFFFFF] rounded-[16px] w-full p-4 shadow-[#D0C9F833] border border-[#F7F7F7] relative overflow-hidden">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <span className="text-[16px] nunito font-semibold text-[#101828]">
              Total Payment
            </span>
            <span className="text-[16px] nunito font-semibold text-[#101828] tracking-tight">
              ₹{receipt.total.toFixed(2)}
            </span>
          </div>

          {/* Items */}
          <div className="space-y-4 mb-4">
            {receipt.items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-start text-[14px]">
                <div className="text-[#645E66] font-regular varela-rounded w-3/4">
                  {item.name}{" "}
                  <span className="text-gray-400 mx-2 text-xs">✕</span> {item.quantity}
                </div>
                <span className="text-[#645E66] varela-rounded font-medium">
                  ₹{item.price}
                </span>
              </div>
            ))}
          </div>

          {/* Taxes */}
          <div className="space-y-3 mb-8">
            <div className="flex justify-between items-center text-[14px]">
              <span className="text-[#645E66] font-regular varela-rounded">
                GST ({receipt.gstPct}%)
              </span>
              <span className="text-[#645E66] varela-rounded font-medium">
                ₹{receipt.gst.toFixed(2)}
              </span>
            </div>
            {/* Service charge is dine-in only — takeaway receipts carry 0,
                so omit the row instead of printing "₹0.00 (10%)". */}
            {receipt.serviceCharge > 0 && (
              <div className="flex justify-between items-center text-[14px]">
                <span className="text-[#645E66] font-regular varela-rounded">
                  Service Charge ({receipt.serviceChargePct}%)
                </span>
                <span className="text-[#645E66] varela-rounded font-medium">
                  ₹{receipt.serviceCharge.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Dashed Divider */}
          <div className="relative w-full h-0.5 mb-8 overflow-hidden">
            <div className="absolute inset-0 border-t border-dashed border-green-500 w-full h-full"></div>
          </div>

          {/* Barcode Area */}
          <div className="flex flex-col items-center justify-center">
            <div className="w-full flex items-stretch justify-center">
              <img
                src={`https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(receipt.orderId)}&code=Code128`}
                alt="barcode"
                onError={(e) => {
                  // Offline fallback: replace with CSS barcode pattern
                  e.target.style.display = 'none';
                  e.target.parentElement.innerHTML = '<div style="width:200px;height:60px;background:repeating-linear-gradient(90deg,#000,#000 2px,#fff 2px,#fff 4px)"></div>';
                }}
              />
            </div>
            <span className="text-[11px] text-gray-800 tracking-wider font-semibold">
              {receipt.orderId}
            </span>
          </div>

          <p className="text-center nunito text-[#101828] font-semibold mt-2 text-[16px]">
            Thank You!
          </p>
        </div>
      </main>

      {/* Button */}
      <div className="sticky bottom-6 left-5 right-5 z-20 px-5">
        <button className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 rounded-[20px] shadow-lg shadow-orange-500/30 transition-colors">
          Send Bill
        </button>
      </div>
    </div>
  );
};

export default BillReceipt;
