import BookingProgressBar from './BookingProgressBar';
import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import PackageDetailModal from "./PackageDetailModal";
import PartyImg from "/party.svg";
import { ChevronLeft, Check } from "lucide-react";
import { useAuth } from '../../Context/AuthContext';
import api from '../../utils/api';

const PackageSelection = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [selectedPackage, setSelectedPackage] = useState(location.state?.selectedPackage || null);
  const [previewPackage, setPreviewPackage] = useState(null);

  const fetchPackages = React.useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await api.get('/booking-info/packages');
      if (res.data.success) {
        setPackages(res.data.packages.filter(p => p.isActive).map(p => {
            const details = [];
            
            if (p.starters?.length) {
              details.push({
                text: 'Starters',
                icon: <i className="fi fi-rr-star" />,
                subItems: p.starters.map(s => s.name)
              });
            }
            if (p.mainCourse?.length) {
              details.push({
                text: 'Main Course',
                icon: <i className="fi fi-rr-restaurant" />,
                subItems: p.mainCourse.map(m => m.name)
              });
            }
            if (p.drinks?.length) {
              details.push({
                text: 'Drinks',
                icon: <i className="fi fi-rr-drink-alt" />,
                subItems: p.drinks.map(d => d.name)
              });
            }
            
            // Add features as top level items if no items array
            if (!details.length && p.items?.length) {
                p.items.forEach(item => {
                    details.push({ text: item, icon: <i className="fi fi-rr-star" />, subItems: [] });
                });
            } else if (p.features?.length) {
                p.features.forEach(f => {
                    details.push({ text: f, icon: <i className="fi fi-rr-check-circle" />, subItems: [] });
                });
            }

            return {
              id: p._id,
              name: p.name,
              price: p.price,
              description: p.description,
              minPeople: p.minPeople || 50,
              maxPeople: p.maxPeople || 500,
              image: p.image?.startsWith('/uploads/') ? `${import.meta.env.VITE_API_URL?.replace(/\/api.*$/, '') || ''}${p.image}` : (p.image || ''),
              details
            };
          }));
      } else {
        setFetchError(res.data?.message || 'Could not load packages.');
      }
    } catch (err) {
      console.error('Fetch packages error:', err);
      const code = err.response?.data?.code;
      const msg = err.response?.data?.message;
      if (code === 'FEATURE_LOCKED') {
        setFetchError(msg || "This restaurant doesn't offer hall packages.");
      } else {
        setFetchError(msg || 'Could not load packages. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  return (
    <div className="min-h-screen bg-[#FDFDFD] xl:bg-[#FFFFFF] dark:bg-gray-900 transition-colors duration-200 font-sans relative flex flex-col items-center">
      <div className="w-full">
        <BookingProgressBar />
      </div>
      <div className="w-full max-w-[1240px] mx-auto px-5 lg:px-12 pb-24 lg:pb-12">

        <div className="flex justify-between items-center mb-6 pt-4">
          <h1 className="text-[28px] font-[800] text-[#1A181B] tracking-tight">Food & Menu</h1>
          <button
            onClick={() => navigate('/customer/cake-details', { state: location.state })}
            className="hidden lg:block bg-[#F8F9FB] border border-[#F2F4F7] px-5 py-2 text-[#645E66] text-[14px] font-[600] rounded-full hover:bg-gray-100 transition-all"
          >
            Skip
          </button>
        </div>

        {/* Mobile Header */}
        <header className="px-4 py-2 mb-4 flex lg:hidden items-center justify-between sticky top-0 bg-white dark:bg-gray-900 z-10 w-full">
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate('/customer/hall-booking', { state: location.state })}
              className="w-6 h-6 rounded-full hover:bg-black/5 dark:hover:bg-gray-800 transition-colors flex items-center justify-center"
            >
              <ChevronLeft size={24} className="text-[#1A181B] dark:text-white" />
            </button>
            <h1 className="text-[18px] font-semibold font-nunito text-[#1A181B] dark:text-white leading-[18px]">
              Food & Menu
            </h1>
          </div>
          <div className="w-[30px] h-[30px] rounded-full overflow-hidden border border-white dark:border-gray-700">
            <img
              src={user?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'Guest')}&background=FE8301&color=fff`}
              alt={user?.name || 'Guest'}
              className="w-full h-full object-cover"
            />
          </div>
        </header>

        {/* Desktop Card Container */}
        <div className="block lg:block lg:bg-[#FFFFFF] lg:rounded-[16px] lg:px-[16px] lg:shadow-sm">
          <main className="lg:pb-0 flex flex-col gap-4 lg:gap-6">
            <div className="grid grid-cols-1 gap-6 pb-24 lg:pb-0">
              {loading ? (
                <div className="flex justify-center p-12">Loading packages...</div>
              ) : fetchError ? (
                <div className="flex flex-col items-center gap-3 p-12 text-center">
                  <span className="text-3xl">🍽️</span>
                  <p className="text-[14px] font-[600] text-[#FF3B30] max-w-md">{fetchError}</p>
                  <button onClick={fetchPackages} className="bg-[#FE8301] text-white px-5 py-2 rounded-[12px] text-[13px] font-[700]">Retry</button>
                </div>
              ) : packages.length === 0 ? (
                <div className="flex flex-col items-center gap-2 p-12 text-center">
                  <span className="text-3xl">🍽️</span>
                  <p className="text-[14px] font-[600] text-[#1A181B]">No packages available</p>
                  <p className="text-[12px] text-[#8D848F]">This restaurant hasn't configured any menu packages yet.</p>
                </div>
              ) : packages.map((pkg) => (
                <div key={pkg.id} className="relative">
                  {selectedPackage?.id === pkg.id && (
                    <div className="absolute top-3 left-3 z-10 bg-[#FE8301] text-white text-[11px] font-bold font-nunito px-3 py-1 rounded-full">
                      ✓ Selected
                    </div>
                  )}
                  <div className={selectedPackage?.id === pkg.id ? 'ring-2 ring-[#FE8301] rounded-[24px]' : ''}>
                    <PackageCard
                      pkg={pkg}
                      onSelect={() => setPreviewPackage(pkg)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </main>
        </div>

        {/* Button Container */}
        {!previewPackage && (
          <>
            {/* Footer Actions (Mobile) */}
            <div className="fixed bottom-0 left-0 right-0 bg-white p-4 flex gap-4 lg:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50">
              <button onClick={() => navigate('/customer/hall-booking', { state: location.state })} className="flex-1 bg-[#F2F2F2] text-[#645E66] font-nunito font-semibold text-[14px] py-3.5 rounded-[16px]">
                Previous
              </button>
              <button
                disabled={!selectedPackage}
                onClick={() => {
                  const packageData = selectedPackage
                    ? { id: selectedPackage.id, name: selectedPackage.name, price: selectedPackage.price }
                    : null;
                  navigate('/customer/cake-details', { state: { ...location.state, selectedPackageId: selectedPackage?.id, selectedPackage: packageData } });
                }}
                className={`flex-1 font-nunito font-semibold text-[14px] py-3.5 rounded-[16px] transition-all ${
                  selectedPackage ? 'bg-[#FE8301] text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                Continue
              </button>
            </div>

            {/* Footer Actions (Desktop) */}
            <div className="hidden lg:flex justify-end gap-3 mt-8 pb-10">
              <button onClick={() => navigate('/customer/hall-booking', { state: location.state })} className="bg-[#F2F2F2] text-[#645E66] font-nunito font-semibold text-[14px] py-3 px-8 rounded-[16px] w-[140px] text-center">
                Previous
              </button>
              <button
                disabled={!selectedPackage}
                onClick={() => {
                  const packageData = selectedPackage
                    ? { id: selectedPackage.id, name: selectedPackage.name, price: selectedPackage.price }
                    : null;
                  navigate('/customer/cake-details', { state: { ...location.state, selectedPackageId: selectedPackage?.id, selectedPackage: packageData } });
                }}
                className={`font-nunito font-semibold text-[14px] py-3 px-8 rounded-[16px] w-[140px] text-center transition-all ${
                  selectedPackage ? 'bg-[#FE8301] text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                Continue
              </button>
            </div>
          </>
        )}

      </div>

      {previewPackage && (
        <PackageDetailModal
          packageData={previewPackage}
          onClose={() => setPreviewPackage(null)}
          onConfirm={() => {
            setSelectedPackage(previewPackage);
            setPreviewPackage(null);
          }}
        />
      )}
    </div>
  );
};

const PackageCard = ({ pkg, onSelect }) => (
  <div onClick={onSelect} className="cursor-pointer mb-6 group">
    {/* Card Container - Pink border effect as per design */}
    <div className="rounded-[24px] bg-[#F8DEFF] p-[4px] pt-[16px] hover:shadow-lg transition-shadow duration-300">
      <div className="bg-white rounded-[20px] p-5 lg:p-4">

        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-[18px] lg:text-[24px] font-semibold text-[#1A181B] font-nunito truncate">
            {pkg.name}
          </h3>
          <div className="flex items-center gap-1.5 bg-[#F8FFEF] px-1.5 py-1 rounded-[60px] ">
            <div className="w-[14px] h-[14px] border border-[#34C759] flex items-center justify-center p-[2px]">
              <div className="w-full h-full bg-[#34C759] rounded-full"></div>
            </div>
            <span className="text-[11px] font-semibold text-[#645E66] font-nunito">Veg</span>
          </div>
        </div>

        {/* Details List */}
        <div className="space-y-4 mb-4">
          {pkg.details.map((item, idx) => (
            <div key={idx}>
              <div className="flex items-center gap-3 text-[#1A181B] mb-1.5">
                <span className="text-gray-400 text-lg w-5 flex justify-center shrink-0">{item.icon}</span>
                <span className="text-[14px] lg:text-[16px] font-[600] font-varela-round">{item.text}</span>
              </div>
              {item.subItems?.length > 0 && (
                <div className="ml-8 flex flex-wrap gap-2">
                  {item.subItems.map((sub, si) => (
                    <span key={si} className="text-[12px] text-[#645E66] bg-[#F8F9FB] border border-[#F2F4F7] px-3 py-1 rounded-full font-[500]">
                      {sub}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-dashed border-gray-200 my-4" />

        {/* Bottom Row: Offer + Price/Button */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

          {/* Offer */}
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[#007AFF]">
              <i className="fi fi-br-badge-percent text-[#007AFF]"></i>
            </div>
            <span className="text-[#007AFF] font-varela-round lg:text-[14px] text-[13px] font-base">
              Special offer applied
            </span>
            <img
              src={PartyImg}
              alt="Celebration"
              className="w-5 h-5"
            />
          </div>

          {/* Price + Button */}
          <div className="flex justify-between items-center gap-2 md:gap-6">
            <div className="font-bold font-varela-round text-[#007AFF] text-[16px] lg:text-[20px] ">
              ₹{pkg.price}/-
              <span className="text-sm font-normal text-[#007AFF] lg:text-[20px] ml-1 font-varela-round">per person</span>
            </div>

            {/* Mobile: + Add Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
              className="md:hidden bg-[#FE8301] active:bg-orange-600 text-white px-6 py-2 rounded-[12px] font-bold text-sm shadow-md shadow-orange-100"
            >
              + Add
            </button>
          </div>
        </div>

      </div>
    </div>
  </div>
);

export default PackageSelection;
