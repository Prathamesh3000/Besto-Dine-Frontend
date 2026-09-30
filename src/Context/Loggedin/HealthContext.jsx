import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import api from '../../utils/api'
import { useAuth } from '../AuthContext'
import { getToken } from '../../utils/authStorage'

const HealthContext = createContext(null)

// Three values used by the customer home's diet filter:
//   'veg'    — show only veg items
//   'nonveg' — show only non-veg items
//   'mix'    — show both (no filter). Default for new users.
//
// 'mix' replaces the older internal 'all' value for clarity; the home
// filter logic accepts BOTH ('mix' || 'all') so any stale localStorage
// entries from prior versions don't suddenly start hiding items.
const DEFAULT_DIET = 'mix'

// EditProfile stores a more granular `dietaryPreference` enum
// ('veg' | 'non_veg' | 'vegan' | 'eggetarian' | 'jain'). For the
// home-filter buckets we only have veg / nonveg / mix, so we collapse
// the granular flavours into the appropriate viewing bucket.
const VEG_LIKE = new Set(['veg', 'vegan', 'eggetarian', 'jain'])
function dietPreferenceFromProfile(profileDiet) {
    if (!profileDiet) return null // no explicit choice → caller keeps current value
    if (VEG_LIKE.has(profileDiet)) return 'veg'
    if (profileDiet === 'non_veg') return 'nonveg'
    return null
}

export function HealthProvider({ children }) {
    // The customer's logged-in user — read so we can apply their saved
    // `dietaryPreference` to the home filter the moment /auth/me resolves.
    // Safe to call here because HealthProvider is mounted INSIDE
    // AuthProvider in App.jsx.
    const { user, isLoading: authLoading } = useAuth()

    // Health mode toggle
    const [healthMode, setHealthMode] = useState(false)

    // Diet preferences — see DEFAULT_DIET notes above.
    const [dietPreference, setDietPreference] = useState(DEFAULT_DIET) // 'veg', 'nonveg', 'mix'

    // Allergies list
    const [allergies, setAllergies] = useState([])

    // Spice level preference
    const [spiceLevel, setSpiceLevel] = useState('medium') // 'mild', 'medium', 'hot'

    const syncTimerRef = useRef(null)

    // Load preferences from localStorage on mount, then try backend
    useEffect(() => {
        const savedPrefs = localStorage.getItem('healthPreferences')
        if (savedPrefs) {
            try {
                const prefs = JSON.parse(savedPrefs)
                setHealthMode(prefs.healthMode || false)
                // Normalise the legacy 'all' value to 'mix' so users on
                // older versions get the renamed bucket without losing
                // their "show everything" choice.
                const saved = prefs.dietPreference
                const normalised = saved === 'all' ? 'mix' : (saved || DEFAULT_DIET)
                setDietPreference(normalised)
                setAllergies(prefs.allergies || [])
                setSpiceLevel(prefs.spiceLevel || 'medium')
            } catch (e) {
                localStorage.removeItem('healthPreferences')
            }
        }

        // Skip the /me hydration on kiosk routes — kiosk is a guest
        // device, no per-user health prefs to load and we don't want
        // to leak a stale staff/customer token into a public terminal.
        const isKioskRoute = typeof window !== 'undefined'
            && window.location.pathname.startsWith('/kiosk');

        // Try to load from backend profile (allergy field) for logged-in users
        const token = getToken()
        if (token && !isKioskRoute) {
            api.get('/auth/me', { _isBackground: true }).then(res => {
                if (res.data?.allergy) {
                    setAllergies(res.data.allergy.split(',').map(s => s.trim()).filter(Boolean))
                }
            }).catch(() => {})
        }
    }, [])

    // Apply the user's saved EditProfile dietaryPreference whenever the
    // logged-in user changes (login, /auth/me refresh, profile update).
    // Treat the field as authoritative — if it's set, it overrides
    // whatever the session toggle / localStorage last held. If the user
    // hasn't picked one (empty string), we leave the current value alone
    // so the header toggle's choice for THIS session is preserved.
    useEffect(() => {
        const mapped = dietPreferenceFromProfile(user?.dietaryPreference)
        if (mapped) setDietPreference(mapped)
    }, [user?.dietaryPreference])

    // Account switch (sign-in, signup, logout) — drop the previous
    // customer's in-memory preferences and start from the new account's
    // own saved profile. Without this, a second account signing in on
    // the same browser saw the first one's allergies, and the debounced
    // sync below pushed them into the new account's profile. The first
    // resolved user (session restore) is adopted as-is so a reload keeps
    // the customer's own cached toggles. Adjusted during render (not in an
    // effect) so the stale values never paint or reach the effects below.
    const userId = user?._id || user?.id || null
    const [trackedUserId, setTrackedUserId] = useState(undefined) // undefined = auth not resolved yet
    if (!authLoading && trackedUserId !== userId) {
        setTrackedUserId(userId)
        if (trackedUserId !== undefined) {
            setHealthMode(false)
            setSpiceLevel('medium')
            setDietPreference(dietPreferenceFromProfile(user?.dietaryPreference) || DEFAULT_DIET)
            setAllergies(String(user?.allergy || '').split(',').map(s => s.trim()).filter(Boolean))
        }
    }

    // Save preferences to localStorage on change
    useEffect(() => {
        localStorage.setItem('healthPreferences', JSON.stringify({
            healthMode,
            dietPreference,
            allergies,
            spiceLevel,
        }))
    }, [healthMode, dietPreference, allergies, spiceLevel])

    // Debounced sync of allergy data to backend when logged in
    useEffect(() => {
        const token = getToken()
        if (!token) return
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
        syncTimerRef.current = setTimeout(() => {
            api.put('/auth/profile', {
                allergy: allergies.join(', ')
            }, { _isBackground: true }).catch(() => {})
        }, 2000)
        return () => clearTimeout(syncTimerRef.current)
    }, [allergies])

    const toggleHealthMode = useCallback(() => {
        setHealthMode(prev => !prev)
    }, [])

    const addAllergy = useCallback((allergy) => {
        setAllergies(prev => prev.includes(allergy) ? prev : [...prev, allergy])
    }, [])

    const removeAllergy = useCallback((allergy) => {
        setAllergies(prev => prev.filter(a => a !== allergy))
    }, [])

    const clearAllergies = useCallback(() => {
        setAllergies([])
    }, [])

    const value = useMemo(() => ({
        healthMode,
        setHealthMode,
        toggleHealthMode,
        dietPreference,
        setDietPreference,
        allergies,
        setAllergies,
        addAllergy,
        removeAllergy,
        clearAllergies,
        spiceLevel,
        setSpiceLevel,
    }), [healthMode, dietPreference, allergies, spiceLevel, toggleHealthMode, addAllergy, removeAllergy, clearAllergies])

    return (
        <HealthContext.Provider value={value}>
            {children}
        </HealthContext.Provider>
    )
}

export function useHealthContext() {
    const context = useContext(HealthContext)
    if (!context) {
        throw new Error('useHealthContext must be used within a HealthProvider')
    }
    return context
}

export default HealthContext
