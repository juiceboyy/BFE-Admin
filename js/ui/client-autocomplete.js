/**
 * Reusable client autocomplete component for manual invoicing and offertes.
 * Provides alphabetical search, rich suggestions, keyboard navigation, and automatic field syncing.
 */

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMatch(text, query) {
    if (!text) return '';
    if (!query) return text;
    const cleanQuery = query.trim();
    if (!cleanQuery) return text;

    try {
        const regex = new RegExp(`(${escapeRegex(cleanQuery)})`, 'gi');
        return text.replace(regex, '<span class="text-blue-600 font-semibold underline decoration-blue-300 decoration-1 underline-offset-2">$1</span>');
    } catch {
        return text;
    }
}

/**
 * Attaches autocomplete behavior to client inputs.
 * 
 * @param {Object} options
 * @param {HTMLInputElement} options.nameInput
 * @param {HTMLButtonElement} [options.toggleBtn]
 * @param {HTMLElement} options.dropdownEl
 * @param {HTMLInputElement} [options.attentionInput]
 * @param {HTMLInputElement} [options.addressInput]
 * @param {HTMLInputElement} [options.cityInput]
 * @param {HTMLButtonElement} [options.btnDelete]
 * @param {Function} options.getClients - Returns array of client objects
 * @param {Function} [options.onSelect] - Callback when client is chosen
 * @param {Function} [options.onReset] - Callback when fields are cleared
 * @returns {{ refreshDeleteState: Function, closeDropdown: Function }}
 */
export function setupClientAutocomplete({
    nameInput,
    toggleBtn,
    dropdownEl,
    attentionInput,
    addressInput,
    cityInput,
    btnDelete,
    getClients,
    onSelect,
    onReset
}) {
    if (!nameInput || !dropdownEl) {
        return { refreshDeleteState: () => {}, closeDropdown: () => {} };
    }

    let activeIndex = -1;
    let currentMatches = [];
    let isOpen = false;

    function getSortedClients() {
        const clients = (typeof getClients === 'function' ? getClients() : []) || [];
        return [...clients].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'nl', { sensitivity: 'base' }));
    }

    function isMatchingSavedClient(name) {
        if (!name || !name.trim()) return false;
        const normalized = name.trim().toLowerCase();
        return getSortedClients().some(c => (c.name || '').trim().toLowerCase() === normalized);
    }

    function refreshDeleteState() {
        if (!btnDelete) return;
        const matching = isMatchingSavedClient(nameInput.value);
        btnDelete.disabled = !matching;
        if (matching) {
            btnDelete.classList.replace('opacity-40', 'opacity-100');
            btnDelete.classList.replace('cursor-not-allowed', 'cursor-pointer');
        } else {
            btnDelete.classList.add('opacity-40', 'cursor-not-allowed');
            btnDelete.classList.remove('opacity-100', 'cursor-pointer');
        }
    }

    function openDropdown() {
        isOpen = true;
        dropdownEl.classList.remove('hidden');
        renderDropdown();
    }

    function closeDropdown() {
        isOpen = false;
        activeIndex = -1;
        dropdownEl.classList.add('hidden');
    }

    function selectClient(client) {
        nameInput.value = client.name || '';
        if (attentionInput) attentionInput.value = client.attention || '';
        if (addressInput) addressInput.value = client.address || '';
        if (cityInput) cityInput.value = client.city || '';

        closeDropdown();
        refreshDeleteState();

        if (typeof onSelect === 'function') {
            onSelect(client);
        }
    }

    function clearFields() {
        if (attentionInput) attentionInput.value = '';
        if (addressInput) addressInput.value = '';
        if (cityInput) cityInput.value = '';

        refreshDeleteState();

        if (typeof onReset === 'function') {
            onReset();
        }
    }

    function filterClients(query) {
        const all = getSortedClients();
        if (!query || !query.trim()) {
            return all;
        }
        const q = query.trim().toLowerCase();
        return all.filter(c => {
            const nameMatch = (c.name || '').toLowerCase().includes(q);
            const cityMatch = (c.city || '').toLowerCase().includes(q);
            const addrMatch = (c.address || '').toLowerCase().includes(q);
            return nameMatch || cityMatch || addrMatch;
        });
    }

    function renderDropdown() {
        const query = nameInput.value;
        currentMatches = filterClients(query);
        activeIndex = -1;

        if (currentMatches.length === 0) {
            dropdownEl.innerHTML = `
                <div class="px-4 py-3 text-xs text-gray-500 italic">
                    Geen bestaande relaties gevonden voor "${query}". Typ gerust een nieuwe naam.
                </div>
            `;
            return;
        }

        dropdownEl.innerHTML = currentMatches.map((client, idx) => {
            const highlightedName = highlightMatch(client.name || '', query);
            const subDetails = [client.address, client.city].filter(Boolean).join(' • ');

            return `
                <div class="client-autocomplete-item px-4 py-2.5 cursor-pointer transition-colors hover:bg-blue-50/80 flex flex-col border-b border-gray-100/60 last:border-b-0"
                    data-index="${idx}">
                    <div class="text-sm font-medium text-gray-900">${highlightName}</div>
                    ${subDetails ? `<div class="text-xs text-gray-500 mt-0.5 truncate">${subDetails}</div>` : ''}
                </div>
            `;
        }).join('');

        dropdownEl.querySelectorAll('.client-autocomplete-item').forEach(el => {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent blur before selection
                const idx = parseInt(el.getAttribute('data-index'), 10);
                if (currentMatches[idx]) {
                    selectClient(currentMatches[idx]);
                }
            });
        });
    }

    function updateHighlight() {
        const items = dropdownEl.querySelectorAll('.client-autocomplete-item');
        items.forEach((item, idx) => {
            if (idx === activeIndex) {
                item.classList.add('bg-blue-50/90');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('bg-blue-50/90');
            }
        });
    }

    // Input Events
    nameInput.addEventListener('focus', () => {
        openDropdown();
    });

    nameInput.addEventListener('click', () => {
        if (!isOpen) openDropdown();
    });

    nameInput.addEventListener('input', () => {
        if (!nameInput.value.trim()) {
            clearFields();
        } else {
            refreshDeleteState();
        }
        openDropdown();
    });

    nameInput.addEventListener('keydown', (e) => {
        if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            openDropdown();
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (currentMatches.length > 0) {
                activeIndex = (activeIndex + 1) % currentMatches.length;
                updateHighlight();
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (currentMatches.length > 0) {
                activeIndex = (activeIndex - 1 + currentMatches.length) % currentMatches.length;
                updateHighlight();
            }
        } else if (e.key === 'Enter') {
            if (isOpen && activeIndex >= 0 && currentMatches[activeIndex]) {
                e.preventDefault();
                selectClient(currentMatches[activeIndex]);
            }
        } else if (e.key === 'Escape') {
            closeDropdown();
        } else if (e.key === 'Tab') {
            closeDropdown();
        }
    });

    // Toggle button (chevron)
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isOpen) {
                closeDropdown();
            } else {
                nameInput.focus();
                openDropdown();
            }
        });
    }

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!dropdownEl.contains(e.target) && e.target !== nameInput && e.target !== toggleBtn && !toggleBtn?.contains(e.target)) {
            closeDropdown();
        }
    });

    // Initial state
    refreshDeleteState();

    return {
        refreshDeleteState,
        closeDropdown
    };
}
