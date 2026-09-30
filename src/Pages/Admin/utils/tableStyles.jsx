import React from 'react'

/**
 * Shared table status style maps — used by TablesDashboard, MergeTables, and related components.
 */

export const statusColors = {
  free: 'bg-[#EBFFEC] border-[#05A22C] shadow-[0px_2px_8px_0px_#00000014]',
  occupied: 'bg-[#FFF3E6] border-[#FE8301] shadow-[0px_2px_8px_0px_#00000014]',
  merged: 'bg-[#F9F1FB] border-[#AD09D4] shadow-[0px_2px_8px_0px_#00000014]',
  reserved: 'bg-[#E5F2FF] border-[#007AFF] shadow-[0px_2px_8px_0px_#00000014]',
  alert: 'bg-[#FFFCEB] border-[#F5CD00] shadow-[0px_2px_8px_0px_#00000014]',
  disabled: 'bg-[#DDDDDD] border-[#AAAAAA] opacity-50 shadow-[0px_2px_8px_0px_#00000014]',
}

export const statusTextColors = {
  free: 'text-gray-700',
  occupied: 'text-yellow-700',
  merged: 'text-green-700',
  reserved: 'text-blue-700',
  alert: 'text-orange-700',
  disabled: 'text-gray-400',
}

// MergeTables uses simpler statusColors (no shadow)
export const mergeStatusColors = {
  free: 'bg-[#EBFFEC] border-[#05A22C]',
  occupied: 'bg-[#FFF3E6] border-[#FE8301]',
  merged: 'bg-[#F9F1FB] border-[#AD09D4]',
  reserved: 'bg-[#E5F2FF] border-[#007AFF]',
  alert: 'bg-[#FFFCEB] border-[#F5CD00]',
  disabled: 'bg-[#DDDDDD] border-[#AAAAAA] opacity-50',
}

export const mergeStatusTextColors = {
  free: 'text-[#05A22C]',
  occupied: 'text-[#FE8301]',
  merged: 'text-[#AD09D4]',
  reserved: 'text-[#007AFF]',
  alert: 'text-[#F5CD00]',
  disabled: 'text-[#AAAAAA]',
}

export const hoverShadows = {
  free: 'hover:shadow-[0px_4px_12px_0px_#05A22C40]',
  occupied: 'hover:shadow-[0px_4px_12px_0px_#FE830140]',
  merged: 'hover:shadow-[0px_4px_12px_0px_#AD09D440]',
  reserved: 'hover:shadow-[0px_4px_12px_0px_#007AFF40]',
  alert: 'hover:shadow-[0px_4px_12px_0px_#F5CD0040]',
  disabled: '',
}

export const statusBadgeStyle = (status) => {
  switch (status) {
    case 'free': return 'bg-[#ECFDF3] text-[#027A48]'
    case 'occupied': return 'bg-[#FFFAEB] text-[#B54708]'
    case 'merged': return 'bg-[#F9F5FF] text-[#6941C6]'
    case 'reserved': return 'bg-[#EFF8FF] text-[#175CD3]'
    case 'alert': return 'bg-[#FFFAEB] text-[#B54708]'
    default: return 'bg-[#F2F4F7] text-[#667085]'
  }
}

export const drawerHeaderBg = (status) => {
  switch (status) {
    case 'free': return 'bg-[#EBFFEC]'
    case 'occupied': return 'bg-[#FFF3E6]'
    case 'merged': return 'bg-[#F9F1FB]'
    case 'reserved': return 'bg-[#E5F2FF]'
    case 'alert': return 'bg-[#FFFCEB]'
    case 'disabled': return 'bg-[#DDDDDD]'
    default: return ''
  }
}

export const drawerTitleColor = (status) => {
  switch (status) {
    case 'free': return 'text-[#05A22C]'
    case 'occupied': return 'text-[#FE8301]'
    case 'merged': return 'text-[#9E77ED]'
    case 'reserved': return 'text-[#007AFF]'
    case 'alert': return 'text-[#F5CD00]'
    case 'disabled': return 'text-[#AAAAAA]'
    default: return 'text-[#667085]'
  }
}

export const statusLabel = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''

export const LEGEND_ITEMS = [
  { label: 'Free', bg: 'bg-[#EBFFEC]', border: 'border-[#05A22C]' },
  { label: 'Occupied', bg: 'bg-[#FFF3E6]', border: 'border-[#FE8301]' },
  { label: 'Merged', bg: 'bg-[#F9F1FB]', border: 'border-[#AD09D4]' },
  { label: 'Reserved', bg: 'bg-[#E5F2FF]', border: 'border-[#007AFF]' },
  { label: 'Alert', bg: 'bg-[#FFFCEB]', border: 'border-[#F5CD00]', icon: true },
  { label: 'Disabled', bg: 'bg-[#DDDDDD]', border: 'border-[#AAAAAA]', opacity: true },
]

/** Local initials avatar — replaces external ui-avatars.com dependency */
export const InitialsAvatar = ({ name, size = 48, bgColor = '#FFE4CC', textColor = '#F79009' }) => {
  const initials = (name || 'G')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('')
  const fontSize = Math.round(size * 0.38)
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 font-[700]"
      style={{ width: size, height: size, background: bgColor, color: textColor, fontSize }}
    >
      {initials}
    </div>
  )
}
