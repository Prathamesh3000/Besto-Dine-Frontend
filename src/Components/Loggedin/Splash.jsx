import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useHealthContext as useHealth } from '../../Context/Loggedin/HealthContext'
import { useAuth } from '../../Context/AuthContext'
import BestoDineMark from '../../assets/BestoDineMark'
import { getActiveTenant } from '../../utils/tenant'

function Splash() {
  const navigate = useNavigate()
  const restaurantName = getActiveTenant()?.name || ''
  const location = useLocation()
  const { healthMode } = useHealth()
  const { isLoggedIn, isGuest, isLoading } = useAuth()

  const isFromQrScan = location.state?.from === 'qr-scan'

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isFromQrScan) {
        // QR scan flow: always go to Login (Login handles logout of stale sessions)
        navigate('/login', {
          replace: true,
          state: { next: '/customer/home', from: 'qr-scan' },
        })
      } else if (isLoggedIn || isGuest) {
        navigate('/customer/home')
      } else {
        navigate('/login')
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [navigate, isLoggedIn, isFromQrScan])

  // Color schemes based on Health Mode
  const colors = healthMode ? {
    bg: '#C8D9B8',           // Light green background
    circle1: '#C8D9B8',      // Lightest green
    circle2: '#B8D1A8',      // Light green
    circle3: '#A8C998',      // Medium green
    circle4: '#98C188',      // Darker green
    logo: '#6B9F5C'          // Dark green logo
  } : {
    bg: '#F5EFE7',           // Beige background
    circle1: '#F5EFE7',      // Lightest beige
    circle2: '#F0E6D8',      // Light beige
    circle3: '#EBD9C8',      // Medium beige
    circle4: '#E6CCB8',      // Darker beige
    logo: '#FF9500'          // Orange logo
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center" style={{ backgroundColor: colors.bg }}>
      {/* Concentric circles background */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Outermost circle */}
        <div
          className="absolute w-[500px] sm:w-[800px] h-[500px] sm:h-[800px] rounded-full opacity-60"
          style={{
            background: `linear-gradient(to bottom right, ${colors.circle1}, ${colors.circle2})`
          }}
        ></div>

        {/* Second circle */}
        <div
          className="absolute w-[400px] sm:w-[650px] h-[400px] sm:h-[650px] rounded-full opacity-70"
          style={{
            background: `linear-gradient(to bottom right, ${colors.circle2}, ${colors.circle3})`
          }}
        ></div>

        {/* Third circle */}
        <div
          className="absolute w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] rounded-full opacity-80"
          style={{
            background: `linear-gradient(to bottom right, ${colors.circle3}, ${colors.circle4})`
          }}
        ></div>

        {/* Fourth circle - darker */}
        <div
          className="absolute w-[200px] sm:w-[350px] h-[200px] sm:h-[350px] rounded-full opacity-90"
          style={{
            background: `linear-gradient(to bottom right, ${colors.circle4}, ${colors.logo})`
          }}
        ></div>
      </div>

      {/* Brand mark — the tile used to be an empty coloured square, so
          no logo was visible at all on the restaurant landing. It now
          carries the BestoDine mark at a legible size, with the
          restaurant's name underneath when a tenant is active. */}
      <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center">
        <div
          className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-[28px] shadow-lg flex items-center justify-center"
          style={{
            background: `linear-gradient(to bottom right, ${colors.logo}, ${colors.logo})`
          }}
        >
          <div className="absolute inset-0 bg-white/10 rounded-[28px]"></div>
          <BestoDineMark className="relative w-16 h-16 sm:w-20 sm:h-20 text-white drop-shadow-sm" />
        </div>
        {restaurantName && (
          <p className="text-[20px] sm:text-[24px] font-bold font-nunito text-[#1A181B] leading-tight max-w-[280px]">
            {restaurantName}
          </p>
        )}
      </div>
    </div>
  )
}

export default Splash


