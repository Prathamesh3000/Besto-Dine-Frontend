import React, { useMemo, useRef, useState } from 'react';
import { X, Plus } from 'lucide-react';

/**
 * Allergy entry with suggestions and removable chips.
 *
 * Replaces a bare free-text input. Free text was a poor fit for a
 * safety field: "penuts", "Peanut", "peanuts " and "nuts" are four
 * different strings that mean the same thing to a kitchen, so nothing
 * downstream could reliably match an allergen against a dish.
 * Suggestions steer people onto the canonical spellings while still
 * accepting anything they type, because no fixed list covers every
 * real allergy.
 *
 * Interaction: typing filters a dropdown of suggestions (matched text
 * highlighted, prefix matches first). Pick with mouse, or Arrow keys +
 * Enter. An "Add “…”" row accepts a custom allergy. Each selection
 * becomes a chip with an × to remove it; Backspace on an empty field
 * removes the last chip.
 *
 * Value is the comma-separated string the API already expects, so this
 * drops into the existing form state unchanged.
 */

/**
 * The 14 major allergens in common food-labelling regulation, plus a
 * few that come up constantly in Indian kitchens. Ordered roughly by
 * how often they're reported so the first suggestions are the likely
 * ones.
 */
const COMMON_ALLERGENS = [
    'Peanuts', 'Tree nuts', 'Milk', 'Eggs', 'Wheat', 'Gluten', 'Soy',
    'Fish', 'Shellfish', 'Crustaceans', 'Sesame', 'Mustard', 'Celery',
    'Lupin', 'Molluscs', 'Sulphites', 'Mushroom', 'Garlic', 'Onion',
    'Coconut', 'Corn', 'Lactose',
];

/** "a, b , ,c" → ['a','b','c'] */
function parseList(value) {
    return String(value || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

/** Render `text` with the first case-insensitive match of `q` bolded. */
function Highlight({ text, q }) {
    const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
    if (i < 0) return text;
    return (
        <>
            {text.slice(0, i)}
            <strong className="font-semibold text-[#B35C00]">{text.slice(i, i + q.length)}</strong>
            {text.slice(i + q.length)}
        </>
    );
}

export default function AllergyPicker({
    value = '',
    onChange,
    id = 'allergy',
    className = '',
    placeholder = 'Start typing, e.g. peanuts, milk, gluten…',
}) {
    const [draft, setDraft] = useState('');
    const [open, setOpen] = useState(false);
    // Keyboard-highlighted option (index into `options`), -1 = none.
    const [active, setActive] = useState(-1);
    const inputRef = useRef(null);

    const selected = useMemo(() => parseList(value), [value]);
    const selectedLower = useMemo(
        () => new Set(selected.map((s) => s.toLowerCase())),
        [selected],
    );

    const query = draft.trim();

    const suggestions = useMemo(() => {
        const q = query.toLowerCase();
        return COMMON_ALLERGENS
            .filter((a) => !selectedLower.has(a.toLowerCase()))
            .filter((a) => (q ? a.toLowerCase().includes(q) : true))
            // Prefix matches first ("mu" → Mustard, Mushroom before others).
            .sort((a, b) => {
                if (!q) return 0;
                return Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q));
            })
            .slice(0, 8);
    }, [query, selectedLower]);

    // Options shown in the dropdown: matching suggestions, plus an
    // "Add “…”" entry for a custom allergy no list could anticipate.
    const options = useMemo(() => {
        const list = suggestions.map((label) => ({ label, custom: false }));
        const exact = suggestions.some((s) => s.toLowerCase() === query.toLowerCase());
        if (query && !exact && !selectedLower.has(query.toLowerCase())) {
            list.push({ label: query, custom: true });
        }
        return list;
    }, [suggestions, query, selectedLower]);

    const commit = (raw) => {
        const item = String(raw || '').trim().replace(/,+$/, '');
        if (!item) return;
        setDraft('');
        setActive(-1);
        // Case-insensitive de-dupe: "Milk" and "milk" are one allergy.
        if (selectedLower.has(item.toLowerCase())) return;
        // Snap to the canonical spelling when the typed text matches a
        // known allergen exactly ("milk" → "Milk").
        const canonical = COMMON_ALLERGENS.find((a) => a.toLowerCase() === item.toLowerCase());
        onChange([...selected, canonical || item].join(', '));
        // Stay open so several allergies can be picked in a row.
        setOpen(true);
        inputRef.current?.focus();
    };

    const remove = (item) => {
        onChange(selected.filter((s) => s !== item).join(', '));
        inputRef.current?.focus();
    };

    const clearAll = () => {
        onChange('');
        inputRef.current?.focus();
    };

    const onKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            if (options.length) setActive((i) => (i + 1) % options.length);
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (options.length) setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
            return;
        }
        // Enter and comma both commit — people type either. Enter must
        // not submit the surrounding form while there's a draft or a
        // highlighted option.
        if (e.key === 'Enter' || e.key === ',') {
            if (open && active >= 0 && options[active]) {
                e.preventDefault();
                commit(options[active].label);
            } else if (draft.trim()) {
                e.preventDefault();
                commit(draft);
            }
            return;
        }
        // Backspace on an empty field removes the last chip, the
        // convention every tag input uses.
        if (e.key === 'Backspace' && !draft && selected.length) {
            remove(selected[selected.length - 1]);
            return;
        }
        if (e.key === 'Escape') {
            setOpen(false);
            setActive(-1);
        }
    };

    const listOpen = open && options.length > 0;

    return (
        <div className="relative">
            {selected.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    <ul className="contents" aria-label="Selected allergies">
                        {selected.map((item) => (
                            <li key={item}>
                                <span className="inline-flex items-center gap-1 bg-[#FFF4E8] text-[#B35C00] border border-orange-200 rounded-full pl-2.5 pr-1 py-1 text-[12px] font-medium">
                                    {item}
                                    <button
                                        type="button"
                                        onClick={() => remove(item)}
                                        aria-label={`Remove ${item}`}
                                        title={`Remove ${item}`}
                                        className="w-4 h-4 rounded-full hover:bg-orange-200/70 flex items-center justify-center transition-colors"
                                    >
                                        <X size={11} />
                                    </button>
                                </span>
                            </li>
                        ))}
                    </ul>
                    {selected.length > 1 && (
                        <button
                            type="button"
                            onClick={clearAll}
                            className="text-[11px] text-[#8D848F] hover:text-red-600 underline underline-offset-2 transition-colors"
                        >
                            Clear all
                        </button>
                    )}
                </div>
            )}

            <input
                ref={inputRef}
                id={id}
                type="text"
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setOpen(true); setActive(-1); }}
                onFocus={() => setOpen(true)}
                // Delay so a click on a suggestion lands before the list
                // unmounts.
                onBlur={() => setTimeout(() => { setOpen(false); setActive(-1); }, 150)}
                onKeyDown={onKeyDown}
                placeholder={selected.length ? 'Add another allergy…' : placeholder}
                autoComplete="off"
                role="combobox"
                aria-expanded={listOpen}
                aria-controls={`${id}-suggestions`}
                aria-activedescendant={listOpen && active >= 0 ? `${id}-opt-${active}` : undefined}
                aria-autocomplete="list"
                className={className}
            />

            {listOpen && (
                <ul
                    id={`${id}-suggestions`}
                    role="listbox"
                    className="absolute z-30 left-0 right-0 mt-1 bg-white border border-[#E6E8DF] rounded-[12px] shadow-lg overflow-hidden max-h-56 overflow-y-auto"
                >
                    {!query && (
                        <li className="px-3 pt-2 pb-1 text-[10.5px] uppercase tracking-[1px] text-[#8D848F]" aria-hidden="true">
                            Common allergens
                        </li>
                    )}
                    {options.map((opt, i) => (
                        <li
                            key={`${opt.custom ? 'custom:' : ''}${opt.label}`}
                            id={`${id}-opt-${i}`}
                            role="option"
                            aria-selected={i === active}
                        >
                            <button
                                type="button"
                                tabIndex={-1}
                                // onMouseDown, not onClick: the input's
                                // blur would otherwise close the list first.
                                onMouseDown={(e) => { e.preventDefault(); commit(opt.label); }}
                                onMouseEnter={() => setActive(i)}
                                className={`w-full text-left px-3 py-2 text-[13px] text-[#1A181B] transition-colors flex items-center gap-2 ${
                                    i === active ? 'bg-[#FFF4E8]' : 'hover:bg-[#FFF4E8]'
                                } ${opt.custom ? 'border-t border-[#F2F4F0]' : ''}`}
                            >
                                <Plus size={12} className="text-[#FE8301] shrink-0" />
                                {opt.custom
                                    ? <span>Add “<span className="font-semibold">{opt.label}</span>”</span>
                                    : <span><Highlight text={opt.label} q={query} /></span>}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <p className="sr-only" aria-live="polite">
                {selected.length ? `${selected.length} allergies selected` : ''}
            </p>
        </div>
    );
}
