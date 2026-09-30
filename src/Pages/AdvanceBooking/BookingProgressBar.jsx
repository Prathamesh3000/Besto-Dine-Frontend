import React from 'react';
import { useLocation } from 'react-router-dom';
import { BOOKING_FLOWS } from './bookingSteps';

const BookingProgressBar = () => {
  const location = useLocation();
  const bookingType = location.state?.bookingType || 'table';
  const flow = BOOKING_FLOWS[bookingType] || BOOKING_FLOWS.table;
  
  // Find current step based on matching the path
  const currentPath = location.pathname;
  let currentStepIndex = flow.findIndex(p => p === currentPath);
  
  // If not found (maybe due to trailing slash), try fuzzy match
  if (currentStepIndex === -1) {
    currentStepIndex = flow.findIndex(p => currentPath.startsWith(p));
  }
  
  const currentStep = currentStepIndex !== -1 ? currentStepIndex + 1 : 1;
  const totalSteps = flow.length;
  const progressPercentage = (currentStep / totalSteps) * 100;

  // Format the step numbers as 0X if less than 10
  const formatStep = (num) => num.toString().padStart(2, '0');

  return (
    <div className="w-full">
      {/* ProgressBar - Desktop */}
      <div className="hidden lg:block w-full">
        <div className="max-w-[1240px] mx-auto px-5 lg:px-12 pt-8">
          <div className="mb-1">
            <span className="text-[12px] font-[600] text-[#645E66]">
              {formatStep(currentStep)}/{formatStep(totalSteps)}
            </span>
          </div>
          <div className="w-full h-[3px] bg-[#EEEEF7] rounded-full overflow-hidden">
            <div 
              className="h-full bg-[#FE8301] transition-all duration-500 rounded-full" 
              style={{ width: `${progressPercentage}%` }} 
            />
          </div>
        </div>
      </div>
      
      {/* Optional Mobile Indicator (Small bar at top) if requested later, 
          currently following user's "hide progress bar" possibly for mobile 
          but keeping the layout consistent with existing components */}
    </div>
  );
};

export default BookingProgressBar;
