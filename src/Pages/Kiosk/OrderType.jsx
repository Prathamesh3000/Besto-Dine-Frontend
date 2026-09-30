import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function OrderType() {
  const navigate = useNavigate();

  const options = [
    {
      id: "dine-in",
      label: "Eat Here",
      desc: "Enjoy your meal at our restaurant",
      icon: "/kiosk/icons/Dinein.svg",
      circleBg: "bg-[#FE8301]",
    },
    {
      id: "takeaway",
      label: "Take Away",
      desc: "Order and pick up your food",
      icon: "/kiosk/icons/Takeaway.svg",
      circleBg: "bg-[#FE8301]",
    },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white font-varela relative">


      <div className="flex flex-col items-center mt-[200px]">
        {/* Title */}
        <h1 className="text-[48px] leading-[100%] uppercase font-nunito font-[800] text-[#1E2939] mb-[50px] tracking-tight">
          Select Order Type
        </h1>

        <div className="flex items-center gap-[40px]">
          {options.map((opt) => (
            <div
              key={opt.label}
              onClick={() => {
                localStorage.setItem('kiosk_order_type', opt.label);
                navigate('/kiosk/menu');
              }}
              className="w-[440px] rounded-[24px] bg-[#F8F9FA] py-[48px] flex flex-col items-center cursor-pointer border-none outline-none transition-transform active:scale-[0.98]"
            >
              {/* Icon Circle */}
              <div className={`w-[240px] h-[240px] rounded-full ${opt.circleBg} flex items-center justify-center mb-10`}>
                <div className="w-[120px] h-[120px] text-white">
                  <img src={opt.icon} alt={opt.label} className="w-full h-full object-contain brightness-0 invert" />
                </div>
              </div>

              {/* Label */}
              <h2 className="text-[36px] font-nunito font-[800] text-[#1E293B] mb-2 leading-[100%]">
                {opt.label}
              </h2>

              {/* Description */}
              <p className="text-[24px] font-varela font-regular text-[#64748B] leading-[100%]">
                {opt.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
