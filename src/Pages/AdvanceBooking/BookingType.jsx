import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../../Context/AuthContext';
import IndoorImg from '/indoor-seeting.svg';
import OutdoorImg from '/outdoor-seeting.svg';
import WindowImg from '/window-seeting.svg';
import PrivateImg from '/private-seeting.svg';
import BookingProgressBar from './BookingProgressBar';
import api, { waiterAPI } from '../../utils/api';

const BookingType = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [selectedTypes, setSelectedTypes] = useState(location.state?.selectedTypes || []);

  const fetchAreas = React.useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await waiterAPI.getAreas();
      if (res.data.success) {
        setAreas(res.data.areas.map(a => ({
          id: a._id,
          title: a.name,
          subtitle: a.note || 'Available for booking',
          image: a.name.toLowerCase().includes('outdoor') ? OutdoorImg :
                 a.name.toLowerCase().includes('window') ? WindowImg :
                 a.name.toLowerCase().includes('private') ? PrivateImg : IndoorImg
        })));

        if (location.state?.selectedTypes === undefined && res.data.areas.length > 0) {
          setSelectedTypes([res.data.areas[0]._id]);
        }
      } else {
        setFetchError(res.data?.message || 'Could not load seating types.');
      }
    } catch (err) {
      console.error('Fetch areas error:', err);
      setFetchError(err.response?.data?.message || 'Could not load seating types. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [location.state?.selectedTypes]);

  React.useEffect(() => {
    if (!location.state?.bookingType) {
      navigate(location.pathname, { state: { ...location.state, bookingType: 'table' }, replace: true });
    }
    fetchAreas();
  }, [fetchAreas]);

  const handleSelect = (id) => {
    setSelectedTypes([id]);
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] font-manrope">
      {/* Mobile Layout */}
      <div className="lg:hidden flex flex-col min-h-screen bg-white pb-28">
        {/* Mobile Header */}
        <header className="flex items-center justify-between px-5 pt-8 pb-4 bg-white sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ChevronLeft size={28} className="text-[#1A181B]" strokeWidth={2.5} />
            </button>
            <h1 className="text-[16px] font-[700] text-[#1A181B]">Select Booking Type</h1>
          </div>
          <div className="w-10 h-10 rounded-full overflow-hidden border border-gray-100">
            <img
              src={user?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'Guest')}&background=FE8301&color=fff`}
              alt="User"
              className="w-full h-full object-cover"
            />
          </div>
        </header>

        {/* Mobile Cards */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 px-4 sm:px-5 pt-4">
          {loading ? (
            <div className="col-span-2 flex justify-center py-10">
              <div className="w-8 h-8 border-4 border-[#FE8301] border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : fetchError ? (
            <div className="col-span-2 flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-[14px] font-[600] text-[#FF3B30]">{fetchError}</p>
              <button onClick={fetchAreas} className="bg-[#FE8301] text-white px-5 py-2 rounded-[12px] text-[13px] font-[700]">Retry</button>
            </div>
          ) : areas.length === 0 ? (
            <div className="col-span-2 flex flex-col items-center gap-2 py-10 text-center">
              <span className="text-3xl">🪑</span>
              <p className="text-[14px] font-[600] text-[#1A181B]">No seating types available</p>
              <p className="text-[12px] text-[#8D848F]">Please contact the restaurant.</p>
            </div>
          ) : areas.map((option) => {
            const isSelected = selectedTypes.includes(option.id);
            return (
              <div
                key={option.id}
                onClick={() => handleSelect(option.id)}
                className={`flex flex-col items-center p-4 sm:p-6 rounded-[32px] transition-all duration-300 cursor-pointer min-h-[170px] sm:h-[180px] justify-center shadow-sm ${isSelected ? 'bg-[#FFF3E0]' : 'bg-[#FAFAFA]'
                  }`}
              >
                <div className="w-full h-[70px] sm:h-[90px] flex items-center justify-center mb-4 sm:mb-6">
                  <img src={option.image} alt={option.title} className="max-w-full max-h-full object-contain" />
                </div>
                <div className="text-center">
                  <h3 className="text-[14px] sm:text-[16px] font-[700] text-[#1A181B] leading-tight">
                    {option.title}
                  </h3>
                  <p className="text-[12px] sm:text-[13px] font-[500] text-[#645E66] mt-1">
                    {option.subtitle}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile Footer (Fixed) */}
        <div className="fixed bottom-0 left-0 right-0 bg-white p-4 flex gap-4 lg:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50">
          <button onClick={() => navigate(-1)} className="flex-1 bg-[#F2F2F2] text-[#645E66] font-nunito font-semibold text-[14px] py-3.5 rounded-[16px]">
            Previous
          </button>
          <button
            onClick={() => navigate('/customer/book-table-details', { state: { ...location.state, selectedTypes, bookingType: 'table' } })}
            className="flex-1 bg-[#FE8301] text-white font-nunito font-semibold text-[14px] py-3.5 rounded-[16px]"
          >
            Continue
          </button>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden lg:flex flex-col items-center justify-start min-h-screen bg-[#FDFDFD] overflow-y-auto pb-12">
        <div className="w-full">
          <BookingProgressBar />
        </div>
        
        <div className="w-full max-w-[1240px] mx-auto px-5 lg:px-12 flex flex-col h-fit mt-8">

          {/* Title Row */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <h1 className="text-[24px] lg:text-[28px] font-[800] text-[#1A181B] tracking-tight leading-tight">Select Booking Type</h1>
          </div>

          {/* Main Option Box */}
          <div className="border border-[#F2F4F7] rounded-[24px] p-6 lg:p-8 bg-white shadow-[0px_2px_12px_rgba(0,0,0,0.02)]">
            <h2 className="text-[16px] font-[700] text-[#1A181B] mb-6">Select Seating Type</h2>

            <div className="grid grid-cols-2 gap-6">
              {loading ? (
                <div className="col-span-2 flex justify-center py-10">
                   <div className="w-8 h-8 border-4 border-[#FE8301] border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : fetchError ? (
                <div className="col-span-2 flex flex-col items-center gap-3 py-10 text-center">
                  <p className="text-[14px] font-[600] text-[#FF3B30]">{fetchError}</p>
                  <button onClick={fetchAreas} className="bg-[#FE8301] text-white px-5 py-2 rounded-[12px] text-[13px] font-[700]">Retry</button>
                </div>
              ) : areas.length === 0 ? (
                <div className="col-span-2 flex flex-col items-center gap-2 py-10 text-center">
                  <span className="text-3xl">🪑</span>
                  <p className="text-[14px] font-[600] text-[#1A181B]">No seating types available</p>
                  <p className="text-[12px] text-[#8D848F]">Please contact the restaurant.</p>
                </div>
              ) : areas.map((option) => {
                const isSelected = selectedTypes.includes(option.id);
                return (
                  <div
                    key={option.id}
                    onClick={() => handleSelect(option.id)}
                    className={`relative flex items-center p-4 rounded-[18px] border transition-all duration-300 cursor-pointer group ${isSelected
                      ? 'border-[#FE8301] bg-[#FFF9F2]'
                      : 'border-[#F2F4F7] bg-white hover:border-[#E5E7EB]'
                      }`}
                  >
                    {/* Illustration */}
                    <div className="w-[80px] h-[65px] flex items-center justify-center shrink-0">
                      <img src={option.image} alt={option.title} className="max-w-full max-h-full object-contain" />
                    </div>

                    {/* Text content */}
                    <div className="ml-5 flex-1">
                      <h3 className="text-[17px] font-[700] text-[#1A181B] leading-tight">
                        {option.title}
                      </h3>
                      <p className="text-[13px] font-[500] text-[#645E66] mt-0.5">
                        {option.subtitle}
                      </p>
                    </div>

                    {/* Radio circle */}
                    <div className={`absolute top-4 right-4 w-[18px] h-[18px] rounded-full border-2 transition-all flex items-center justify-center ${isSelected ? 'border-[#FE8301] bg-[#FE8301]' : 'border-[#D1D5DB]'
                      }`}>
                      {isSelected && <div className="w-2 h-2 bg-white rounded-full shadow-sm" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Desktop Footer Actions */}
          <div className="hidden lg:flex justify-end gap-3 mt-8 pb-10">
            <button
              onClick={() => navigate(-1)}
              className="bg-[#F2F2F2] text-[#645E66] font-nunito font-semibold text-[14px] py-3 px-8 rounded-[16px] w-[140px] text-center"
            >
              Previous
            </button>
            <button
               onClick={() => {
                 const selectedTypeNames = areas.filter(a => selectedTypes.includes(a.id)).map(a => a.title);
                 navigate('/customer/book-table-details', { state: { ...location.state, selectedTypes, selectedTypeNames, bookingType: 'table' } });
               }}
              className="bg-[#FE8301] text-white font-nunito font-semibold text-[14px] py-3 px-8 rounded-[16px] w-[140px] text-center"
            >
              Continue
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default BookingType;
