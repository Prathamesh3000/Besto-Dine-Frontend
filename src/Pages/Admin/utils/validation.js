/**
 * Legacy validation helpers — DEPRECATED.
 *
 * These return `{ isValid, error }` and are kept ONLY for compatibility
 * with three admin modals that haven't been migrated yet:
 *   - AddTableModal.jsx
 *   - AddReservationModal.jsx
 *   - AddAreaModal.jsx
 *
 * For all NEW forms, use the combinators from
 *   `Frontend/src/hooks/useFormValidation.js`
 * which return `string | null` and compose with combine(...). They're
 * pure functions over `(value, allValues)` and pair cleanly with the
 * `useFormValidation()` hook + `<FormField />`.
 *
 * Once the three modals above are migrated, this file can be deleted.
 */

export const validateGuestName = (name) => {
    if (!name || name.trim().length === 0) {
        return { isValid: false, error: 'Guest name is required' };
    }
    if (name.trim().length < 2) {
        return { isValid: false, error: 'Name must be at least 2 characters' };
    }
    return { isValid: true, error: null };
};

export const validatePhoneNumber = (phone) => {
    if (!phone || phone.trim().length === 0) {
        return { isValid: false, error: 'Phone number is required' };
    }
    const cleanPhone = phone.trim().replace(/\s+/g, '');
    if (!/^\d{10}$/.test(cleanPhone)) {
        return { isValid: false, error: 'Phone number must be exactly 10 digits' };
    }
    return { isValid: true, error: null };
};

export const validateTime = (time) => {
    if (!time || time.trim().length === 0) {
        return { isValid: false, error: 'Time is required' };
    }
    return { isValid: true, error: null };
};

export const validateGuestCount = (count) => {
    const num = parseInt(count, 10);
    if (isNaN(num) || num <= 0) {
        return { isValid: false, error: 'Guest count must be at least 1' };
    }
    return { isValid: true, error: null };
};

export const validateRequiredSelection = (value, fieldName) => {
    if (!value || value.toString().trim() === '') {
        return { isValid: false, error: `${fieldName} is required` };
    }
    return { isValid: true, error: null };
};

export const validateTableName = (name) => {
    if (!name || name.trim().length === 0) {
        return { isValid: false, error: 'Table name is required' };
    }
    return { isValid: true, error: null };
};

export const validateCapacity = (capacity) => {
    const num = parseInt(capacity, 10);
    if (isNaN(num) || num <= 0) {
        return { isValid: false, error: 'Capacity must be at least 1' };
    }
    return { isValid: true, error: null };
};

export const validateAreaName = (name) => {
    if (!name || name.trim().length === 0) {
        return { isValid: false, error: 'Area name is required' };
    }
    return { isValid: true, error: null };
};
