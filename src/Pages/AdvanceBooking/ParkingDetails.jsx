import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Minus, Plus, ChevronDown, Loader2 } from 'lucide-react';
import { useAuth } from '../../Context/AuthContext';
import { bookingInfoAPI } from '../../utils/api';
import BookingProgressBar from './BookingProgressBar';
import BikeImg from "/bike.svg";
import CarImg from "/car.svg";
import BusImg from "/bus.svg";

const VEHICLE_ICONS = { bike: BikeImg, car: CarImg, bus: BusImg };

const ParkingDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [selectedVehicle, setSelectedVehicle] = useState(location.state?.selectedVehicle || null);
  const [vehicleCount, setVehicleCount] = useState(location.state?.vehicleCount || 1);
  const [parkingDuration, setParkingDuration] = useState(location.state?.parkingDuration || 2);
  const [isDurationOpen, setIsDurationOpen] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [maxDuration, setMaxDuration] = useState(6);
  const [loading, setLoading] = useState(true);
  const [parkingRates, setParkingRates] = useState({ bike: 20, car: 50, bus: 100 });

  useEffect(() => {
    bookingInfoAPI.getParkingRates().then(res => {
      if (res.data?.success) {
        const parking = res.data.parking;
        const mapped = (parking.vehicles || []).map(v => ({
          id: v.id || v.label?.toLowerCase(),
          label: v.label,
          price: `₹${v.pricePerHour}/hour`,
          pricePerHour: v.pricePerHour,
          icon: VEHICLE_ICONS[v.id || v.label?.toLowerCase()] || CarImg,
        }));
        setVehicles(mapped);
        // Build rates map for BookingReview
        const rates = {};
        mapped.forEach(v => { rates[v.id] = v.pricePerHour || 0; });
        setParkingRates(rates);
        if (parking.maxDuration) setMaxDuration(parking.maxDuration);
      }
    }).catch(() => {
      // Fallback defaults on error
      setVehicles([
        { id: 'bike', label: 'Bike', price: '₹20/hour', icon: BikeImg },
        { id: 'car', label: 'Car', price: '₹50/hour', icon: CarImg },
        { id: 'bus', label: 'Bus', price: '₹100/hour', icon: BusImg },
      ]);
    }).finally(() => setLoading(false));
  }, []);

  const handlePrevious = () => {
    navigate('/customer/add-ons', { state: { ...location.state, selectedVehicle, vehicleCount, parkingDuration } });
  };

  const handleContinue = () => {
    navigate('/customer/booking-review', {
      state: {
        ...location.state,
        selectedVehicle,
        vehicleCount,
        parkingDuration,
        parkingSkipped: false,
        parkingRates
      }
    });
  };

  const handleSkip = () => {
    navigate('/customer/booking-review', { state: { ...location.state, parkingSkipped: true } });
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] font-manrope selection:bg-orange-100 overflow-x-hidden">
      <div className="w-full">
        <BookingProgressBar />
      </div>

      <div className="max-w-[1240px] mx-auto pb-24 lg:pb-12 px-5 lg:px-12">
        {/* Mobile Header */}
        <header className="flex lg:hidden items-center justify-between py-6 bg-white sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <button onClick={handlePrevious} className="p-1 -ml-1">
              <ChevronLeft size={24} className="text-[#1A181B]" />
            </button>
            <h1 className="text-[18px] font-[700] text-[#1A181B]">Parking Details</h1>
          </div>
          <button onClick={handleSkip} className="text-[14px] font-[600] text-[#1A181B] bg-[#F8F9FB] px-4 py-1.5 border border-[#F2F4F7] rounded-full">
            Skip
          </button>
        </header>

        {/* Desktop Title & Skip */}
        <div className="flex justify-between items-center mb-6 pt-4">
          <h1 className="hidden lg:block text-[28px] font-[800] text-[#1A181B] tracking-tight">Parking Details</h1>
          <button onClick={handleSkip} className="hidden lg:block bg-[#F8F9FB] border border-[#F2F4F7] px-5 py-2 text-[#645E66] text-[14px] font-[600] rounded-full hover:bg-gray-100 transition-all">
            Skip
          </button>
        </div>

        <main className="mt-8 flex flex-col gap-6">
          <div className="bg-white border border-[#F2F4F7] rounded-[24px] p-6 lg:p-8 shadow-[0px_2px_12px_rgba(0,0,0,0.02)]">
            <h3 className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B] mb-6">Select Vehicle Type</h3>

            <div className="grid grid-cols-3 gap-3 lg:gap-6 mb-6">
              {vehicles.map((v) => {
                const isSelected = selectedVehicle === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVehicle(v.id)}
                    className={`flex flex-col items-center p-4 py-6 rounded-[20px] transition-all cursor-pointer border-2 ${isSelected
                      ? 'bg-[#FFF9F2] border-[#FE8301]'
                      : 'bg-white border-[#F2F4F7] hover:border-orange-100'
                      }`}
                  >
                    <div className="w-[60px] h-[60px] lg:w-[84px] lg:h-[84px] mb-4">
                      <img src={v.icon} alt={v.label} className="w-full h-full object-contain drop-shadow-sm" />
                    </div>
                    <h4 className="text-[15px] lg:text-[16px] font-[700] text-[#1A181B] mb-1">{v.label}</h4>
                    <p className="text-[12px] lg:text-[14px] font-[500] text-[#645E66]">{v.price}</p>
                  </button>
                )
              })}
            </div>

            <p className="text-[#007AFF] text-[14px] font-[600] hover:underline cursor-pointer">
              Charges may apply for extended duration!
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            {/* Vehicle Count Card */}
            <div className="bg-white border border-[#F2F4F7] rounded-[20px] p-4 lg:px-6 lg:py-5 flex items-center justify-between shadow-[0px_2px_12px_rgba(0,0,0,0.02)]">
              <span className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B]">Vehicle Count</span>
              <div className="flex items-center bg-[#F8F9FB] rounded-[14px] p-1 border border-[#F2F4F7]">
                <button
                  onClick={() => setVehicleCount(Math.max(1, vehicleCount - 1))}
                  className="w-10 h-10 flex items-center justify-center text-[#645E66] hover:text-[#1A181B] transition-colors"
                >
                  <Minus size={20} />
                </button>
                <span className="w-10 text-center font-[700] text-[#1A181B] text-[18px]">{vehicleCount}</span>
                <button
                  onClick={() => setVehicleCount(vehicleCount + 1)}
                  className="w-10 h-10 flex items-center justify-center text-[#645E66] hover:text-[#1A181B] transition-colors"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>

            {/* Parking Duration Card */}
            <div className="bg-white border border-[#F2F4F7] rounded-[20px] p-4 lg:px-6 lg:py-5 flex items-center justify-between shadow-[0px_2px_12px_rgba(0,0,0,0.02)] relative">
              <span className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B]">Parking Duration</span>
              <div className="relative">
                <div
                  onClick={() => setIsDurationOpen(!isDurationOpen)}
                  className="flex items-center gap-2 font-[700] text-[#1A181B] text-[16px] lg:text-[18px] cursor-pointer hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors select-none border border-transparent hover:border-gray-200"
                >
                  <span>{parkingDuration} {parkingDuration === 1 ? 'hr' : 'hrs'}</span>
                  <ChevronDown size={18} className={`text-[#645E66] transition-transform duration-200 ${isDurationOpen ? 'rotate-180' : ''}`} />
                </div>

                {isDurationOpen && (
                  <div className="absolute bottom-full mb-2 lg:bottom-auto lg:top-full lg:mt-2 right-0 w-[120px] bg-white rounded-[16px] shadow-[0px_8px_24px_rgba(0,0,0,0.12)] border border-[#F2F4F7] overflow-hidden z-50">
                    {Array.from({ length: maxDuration }, (_, i) => i + 1).map((h) => (
                      <div
                        key={h}
                        onClick={() => {
                          setParkingDuration(h);
                          setIsDurationOpen(false);
                        }}
                        className={`px-4 py-3 cursor-pointer text-center text-[15px] font-[600] transition-colors ${parkingDuration === h
                          ? 'bg-[#FFF9F2] text-[#FE8301]'
                          : 'text-[#645E66] hover:bg-gray-50 hover:text-[#1A181B]'
                          }`}
                      >
                        {h} {h === 1 ? 'hr' : 'hrs'}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* Footer Actions (Desktop & Mobile) */}
        <div className="fixed bottom-0 left-0 right-0 bg-white p-4 flex gap-4 lg:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50">
          <button onClick={() => navigate(-1)} className="flex-1 bg-[#F2F2F2] text-[#645E66] font-nunito font-semibold text-[14px] py-3.5 rounded-[16px]">
            Previous
          </button>
          <button
            onClick={handleContinue}
            disabled={!selectedVehicle}
            className={`flex-1 font-nunito font-semibold text-[14px] py-3.5 rounded-[16px] ${!selectedVehicle
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-[#FE8301] text-white'
              }`}
          >
            Continue
          </button>
        </div>

        <div className="hidden lg:flex justify-end gap-3 mt-8 pb-10">
          <button onClick={() => navigate(-1)} className="bg-[#F2F2F2] text-[#645E66] font-nunito font-semibold text-[14px] py-3 px-8 rounded-[16px] w-[140px] text-center">
            Previous
          </button>
          <button
            onClick={handleContinue}
            disabled={!selectedVehicle}
            className={`font-nunito font-semibold text-[14px] py-3 px-8 rounded-[16px] w-[140px] text-center ${!selectedVehicle
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-[#FE8301] text-white'
              }`}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default ParkingDetails;
