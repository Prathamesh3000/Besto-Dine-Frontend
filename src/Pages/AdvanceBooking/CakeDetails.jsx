import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Check, Minus, Plus, Loader } from 'lucide-react';
import { useAuth } from '../../Context/AuthContext';
import BookingProgressBar from './BookingProgressBar';
import api from '../../utils/api';

const BACKEND_URL = import.meta.env.VITE_API_URL?.replace(/\/api.*$/, '') || '';

const resolveImage = (src) => {
  if (!src) return '';
  if (src.startsWith('/uploads/')) return `${BACKEND_URL}${src}`;
  return src;
};

const CakeDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [rawFlavors, setRawFlavors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [selectedFlavor, setSelectedFlavor] = useState(location.state?.selectedFlavor || null);
  const [selectedSize, setSelectedSize] = useState(location.state?.selectedSize || null);
  const [isVeg, setIsVeg] = useState(location.state?.isVeg !== undefined ? location.state.isVeg : true);
  const [quantity, setQuantity] = useState(location.state?.quantity || 1);
  const [specialMessage, setSpecialMessage] = useState(location.state?.specialMessage || '');

  const fetchCakes = React.useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await api.get('/booking-info/cakes');
      if (res.data.success) {
        setRawFlavors(res.data.cakes || []);
      } else {
        setFetchError(res.data?.message || 'Could not load cakes.');
      }
    } catch (err) {
      console.error('Fetch cakes error:', err);
      const code = err.response?.data?.code;
      const msg = err.response?.data?.message;
      if (code === 'FEATURE_LOCKED') {
        setFetchError(msg || "This restaurant doesn't offer cake bookings.");
      } else {
        setFetchError(msg || 'Could not load cakes. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCakes();
  }, [fetchCakes]);

  // Filter cakes by veg/non-veg selection
  const flavors = useMemo(() => {
    return rawFlavors
      .filter(c => {
        if (isVeg) return c.vegType === 'veg' || !c.vegType;
        return c.vegType === 'non-veg';
      })
      .map(c => ({
        id: c._id,
        title: c.name,
        subtitle: c.vegType === 'non-veg' ? 'Contains Egg' : 'Eggless',
        image: resolveImage((c.images && c.images.length > 0) ? c.images[0] : c.image)
      }));
  }, [rawFlavors, isVeg]);

  // Reset selection when veg filter changes and selected flavor is no longer visible
  useEffect(() => {
    if (selectedFlavor && !flavors.find(f => f.id === selectedFlavor)) {
      setSelectedFlavor(null);
      setSelectedSize(null);
    }
  }, [flavors, selectedFlavor]);

  // Auto-set isVeg when flavor is selected
  useEffect(() => {
    if (selectedFlavor && rawFlavors.length > 0) {
      const current = rawFlavors.find(f => f._id === selectedFlavor);
      if (current) setIsVeg(current.vegType === 'veg' || !current.vegType);
    }
  }, [selectedFlavor, rawFlavors]);

  const currentCake = rawFlavors.find(f => f._id === selectedFlavor);
  const sizes = currentCake?.sizes?.map(s => ({
    id: s._id,
    label: s.name,
    price: s.price
  })) || [];

  const handlePrevious = () => {
    const backState = { ...location.state, selectedFlavor, selectedSize, isVeg, quantity, specialMessage };
    navigate(location.state?.bookingType === 'hall' ? '/customer/package-selection' : '/customer/book-table-details', { state: backState });
  };

  const handleContinue = () => {
    const flavorObj = rawFlavors.find(f => f._id === selectedFlavor);
    const sizeObj = flavorObj?.sizes?.find(s => s._id === selectedSize);

    const curState = {
      ...location.state,
      selectedFlavor,
      selectedFlavorName: flavorObj?.name || null,
      selectedSize,
      selectedSizeName: sizeObj?.name || null,
      selectedCakeData: sizeObj ? { price: sizeObj.price } : null,
      isVeg,
      quantity,
      specialMessage
    };
    navigate(location.state?.bookingType === 'hall' ? '/customer/decoration' : '/customer/add-ons', {
      state: curState
    });
  };

  const handleSkip = () => {
    navigate(location.state?.bookingType === 'hall' ? '/customer/decoration' : '/customer/add-ons', { state: { ...location.state } });
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] font-manrope selection:bg-orange-100 overflow-x-hidden">
      <div className="w-full">
        <BookingProgressBar />
      </div>

      <div className="max-w-[1240px] mx-auto pb-28 lg:pb-12 px-5 lg:px-12">
        {/* Mobile Header */}
        <header className="flex lg:hidden items-center justify-between py-5 bg-[#FDFDFD] sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <button onClick={handlePrevious} className="p-1 -ml-1">
              <ChevronLeft size={24} className="text-[#1A181B]" />
            </button>
            <h1 className="text-[18px] font-[700] text-[#1A181B]">Cake Details</h1>
          </div>
          <button onClick={handleSkip} className="text-[14px] font-[600] text-[#1A181B] bg-[#F8F9FB] px-4 py-1.5 border border-[#F2F4F7] rounded-full">
            Skip
          </button>
        </header>

        {/* Desktop Title & Skip */}
        <div className="hidden lg:flex justify-between items-center mb-6 pt-4">
          <h1 className="text-[28px] font-[800] text-[#1A181B] tracking-tight">Cake Details</h1>
          <button onClick={handleSkip} className="bg-[#F8F9FB] border border-[#F2F4F7] px-5 py-2 text-[#645E66] text-[14px] font-[600] rounded-full hover:bg-gray-100 transition-all">
            Skip
          </button>
        </div>

        <main className="flex flex-col gap-5">
          {/* Quantity Selector */}
          <div className="bg-white border border-[#F2F4F7] rounded-[20px] p-5 lg:px-8 lg:py-4 flex items-center justify-between shadow-[0px_2px_12px_rgba(0,0,0,0.02)]">
            <span className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B]">Cake Quantity</span>
            <div className="flex items-center bg-[#F8F9FB] rounded-[14px] p-1 border border-[#F2F4F7]">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-10 h-10 flex items-center justify-center text-[#645E66] hover:text-[#1A181B] transition-colors"
              >
                <Minus size={20} />
              </button>
              <span className="w-10 text-center font-[700] text-[#1A181B] text-[18px]">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-10 h-10 flex items-center justify-center text-[#645E66] hover:text-[#1A181B] transition-colors"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            {/* Left — Cake Flavors */}
            <div className="bg-white border border-[#F2F4F7] rounded-[20px] p-5 lg:p-8 shadow-[0px_2px_12px_rgba(0,0,0,0.02)]">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B]">Cake Flavors</h3>

                {/* Veg / Non-Veg Toggle */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsVeg(true)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${isVeg ? 'bg-[#F1FCF4] border-[#34C759]' : 'bg-transparent border-transparent'}`}
                  >
                    <div className="w-6 h-6 rounded-[5px] border-[1.5px] border-[#34C759] flex items-center justify-center bg-white">
                      <div className="w-2.5 h-2.5 bg-[#34C759] rounded-full" />
                    </div>
                  </button>
                  <button
                    onClick={() => setIsVeg(false)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${!isVeg ? 'bg-[#FFFAF5] border-[#FF3B30]' : 'bg-transparent border-transparent'}`}
                  >
                    <div className="w-6 h-6 rounded-[5px] border-[1.5px] border-[#FF3B30] flex items-center justify-center bg-white">
                      <div className="w-2.5 h-2.5 bg-[#FF3B30] rounded-full" />
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
                {loading ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-12 gap-3">
                    <Loader size={28} className="text-[#FE8301] animate-spin" />
                    <p className="text-[14px] text-[#8D848F] font-[500]">Loading cakes...</p>
                  </div>
                ) : fetchError ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-10 gap-3">
                    <span className="text-3xl">🎂</span>
                    <p className="text-[14px] font-[600] text-[#FF3B30] max-w-md text-center">{fetchError}</p>
                    <button onClick={fetchCakes} className="bg-[#FE8301] text-white px-5 py-2 rounded-[12px] text-[13px] font-[700]">Retry</button>
                  </div>
                ) : flavors.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-10 gap-2">
                    <span className="text-3xl">🎂</span>
                    <p className="text-[14px] font-[600] text-[#1A181B]">No {isVeg ? 'veg' : 'non-veg'} cakes found</p>
                    <p className="text-[12px] text-[#8D848F] text-center">Try switching the filter above</p>
                  </div>
                ) : (
                  flavors.map((flavor) => {
                    const isSelected = selectedFlavor === flavor.id;
                    return (
                      <button
                        key={flavor.id}
                        onClick={() => {
                          setSelectedFlavor(flavor.id);
                          setSelectedSize(null);
                        }}
                        className={`flex flex-col items-center p-3 rounded-[16px] transition-all border-2 ${isSelected
                          ? 'bg-[#FFF9F2] border-[#FE8301]'
                          : 'bg-white border-[#F2F4F7] hover:border-orange-100'
                        }`}
                      >
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden mb-2.5 shadow-sm bg-gray-50">
                          {flavor.image ? (
                            <img src={flavor.image} alt={flavor.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl">🎂</div>
                          )}
                        </div>
                        <h4 className="text-[13px] sm:text-[14px] font-[700] text-[#1A181B] text-center leading-tight mb-0.5 truncate w-full">{flavor.title}</h4>
                        <p className="text-[11px] font-[500] text-[#645E66] text-center">{flavor.subtitle}</p>
                      </button>
                    );
                  })
                )}
              </div>
              <p className="text-[#007AFF] text-[13px] font-[600] mt-5 hover:underline cursor-pointer">
                Additional cake decoration may cost extra!
              </p>
            </div>

            {/* Right — Size & Message */}
            <div className="flex flex-col gap-5">
              {/* Size Selection */}
              <div className="bg-white border border-[#F2F4F7] rounded-[20px] p-5 lg:p-8 shadow-[0px_2px_12px_rgba(0,0,0,0.02)]">
                <div className="mb-5">
                  <h3 className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B] mb-1">Size</h3>
                  <p className="text-[#645E66] text-[14px] font-[500]">{selectedFlavor ? 'Select any 1 weight' : 'Select a flavor first'}</p>
                </div>
                <div className="flex flex-col gap-3">
                  {!selectedFlavor ? (
                    <div className="py-8 flex items-center justify-center bg-[#F8F9FB] rounded-[14px] border border-dashed border-[#E2E4F0]">
                      <p className="text-[14px] font-[500] text-[#8D848F]">Sizes will appear after selecting a flavor</p>
                    </div>
                  ) : sizes.length === 0 ? (
                    <div className="py-8 flex items-center justify-center bg-[#F8F9FB] rounded-[14px] border border-dashed border-[#E2E4F0]">
                      <p className="text-[14px] font-[500] text-[#8D848F]">No sizes available</p>
                    </div>
                  ) : (
                    sizes.map((size) => {
                      const isSelected = selectedSize === size.id;
                      return (
                        <button
                          key={size.id}
                          onClick={() => setSelectedSize(size.id)}
                          className="flex items-center justify-between pb-3 border-b border-[#F2F4F7] last:border-0 last:pb-0 text-left"
                        >
                          <span className="text-[#1A181B] text-[15px] font-[600]">{size.label}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-[#645E66] text-[14px] font-[500]">₹{size.price.toLocaleString('en-IN')}</span>
                            <div className={`w-[22px] h-[22px] rounded-full border-[2px] flex items-center justify-center transition-all ${isSelected
                              ? 'bg-[#FE8301] border-[#FE8301]'
                              : 'border-[#D9D9D9] bg-white'
                            }`}>
                              {isSelected && <Check size={14} className="text-white" strokeWidth={3.5} />}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Special Message */}
              <div className="bg-white border border-[#F2F4F7] rounded-[20px] p-5 lg:p-8 shadow-[0px_2px_12px_rgba(0,0,0,0.02)] flex-1">
                <h3 className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B] mb-3">Special Message</h3>
                <textarea
                  value={specialMessage}
                  onChange={(e) => setSpecialMessage(e.target.value)}
                  className="w-full bg-[#F4F5FA] rounded-[14px] p-4 text-[15px] font-[500] outline-none text-[#1A181B] placeholder-[#8D848F] h-[100px] sm:h-[120px] resize-none border border-transparent focus:border-[#E2E4F0]"
                  placeholder="Any special requests?&#10;(e.g., Happy Birthday Love)"
                />
              </div>
            </div>
          </div>

          {/* Desktop Footer */}
          <div className="hidden lg:flex justify-end gap-5 mt-4 mb-12">
            <button
              onClick={handlePrevious}
              className="px-10 py-3.5 bg-[#F2F4F7] text-[#645E66] font-[700] rounded-[16px] text-[15px] hover:bg-gray-200 transition-all"
            >
              Previous
            </button>
            <button
              onClick={handleContinue}
              disabled={!selectedFlavor || !selectedSize}
              className={`px-10 py-3.5 rounded-[16px] font-[700] text-[15px] transition-all ${(!selectedFlavor || !selectedSize)
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-[#FE8301] text-white hover:bg-[#e07400] shadow-lg shadow-orange-100'
              }`}
            >
              Continue
            </button>
          </div>
        </main>

        {/* Mobile Footer */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white p-4 border-t border-gray-100 flex gap-3 z-50">
          <button
            onClick={handlePrevious}
            className="flex-1 bg-[#F2F4F7] text-[#645E66] font-[700] py-3.5 rounded-[16px] text-[15px]"
          >
            Previous
          </button>
          <button
            onClick={handleContinue}
            disabled={!selectedFlavor || !selectedSize}
            className={`flex-1 font-[700] py-3.5 rounded-[16px] text-[15px] transition-all ${(!selectedFlavor || !selectedSize)
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-[#FE8301] text-white active:scale-[0.98]'
            }`}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default CakeDetails;
