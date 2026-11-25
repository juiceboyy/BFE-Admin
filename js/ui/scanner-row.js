/**
 * js/ui/scanner-row.js
 * Verantwoordelijk voor het genereren van HTML voor de scanner tabel.
 */
import { isDateValidForPeriod } from '../utils/date.js';
import { getCurrencySymbol } from '../utils/currency.js';

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function getBatchRowHTML(item, dateInfo, currentMode = 'inkoop', index) {
    if (item.status === 'duplicate_skipped') {
        const trashDriveCell = item.driveFileId
            ? `<button type="button" class="trash-drive-btn inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors"
                    data-item-id="${item.id}" title="Direct naar Google Drive Prullenbak verplaatsen">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5 pointer-events-none"></i> Prullenbak
               </button>`
            : '<span class="text-xs text-gray-300">-</span>';

        return `
            <tr id="batch-row-${item.id}" class="bg-amber-50/70 hover:bg-amber-100/60 border-b transition-colors opacity-80">
                <td class="px-4 py-3 align-middle text-center">
                    <input type="checkbox" class="queue-item-select w-4 h-4 rounded border-gray-300 text-blue-600 cursor-not-allowed"
                        data-item-id="${item.id}" disabled>
                </td>
                <td class="px-4 py-3 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                        <i data-lucide="file-text" class="w-4 h-4 text-gray-400"></i>
                        <span class="text-sm font-medium text-gray-900 truncate max-w-[150px]" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</span>
                    </div>
                </td>
                <td class="px-4 py-3 whitespace-nowrap">
                    ${getStatusBadge(item)}
                </td>
                <td colspan="6" class="px-4 py-3 text-xs text-amber-900">
                    <div class="flex items-center justify-between gap-3">
                        <span class="truncate" title="${escapeHtml(item.duplicateReason)}">${escapeHtml(item.duplicateReason || 'Exact MD5-duplicaat overgeslagen')}</span>
                        <button type="button" class="rescan-item-btn shrink-0 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-md transition-colors"
                            data-item-id="${item.id}">
                            Toch scannen
                        </button>
                    </div>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-center">
                    ${trashDriveCell}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-center">
                    <button class="delete-item-btn p-1 text-gray-400 hover:text-red-600 transition-colors" data-index="${index}" title="Uit wachtrij verwijderen">
                        <i data-lucide="x" class="w-4 h-4 pointer-events-none"></i>
                    </button>
                </td>
            </tr>`;
    }

    const isDisabled = ['pending', 'processing', 'saved'].includes(item.status);
    const disabledAttr = isDisabled ? 'disabled' : '';
    const opacityClass = isDisabled ? 'opacity-50 cursor-not-allowed' : '';
    const isDeselected = item.selected === false;
    const d = item.data || {};
    const options = d.options || [];
    
    const isDateWarning = d.datum ? !isDateValidForPeriod(d.datum, dateInfo.targetYear, dateInfo.targetMonthNum) : false;
    const dateClasses = isDateWarning 
        ? `border-orange-500 bg-orange-50 text-orange-800 font-bold focus:ring-orange-500 ${opacityClass}` 
        : `border-gray-300 bg-gray-50 text-gray-900 focus:ring-blue-500 ${opacityClass}`;

    let omschrijvingInput;
    if (options.length > 0) {
        const listId = `list-omschrijving-${item.id}`;
        omschrijvingInput = `
            <input type="text" id="omschrijving-${item.id}" list="${listId}" class="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm " value="${item.data && item.data.omschrijving ? item.data.omschrijving : ''}"  placeholder="Kies of typ...">
            <datalist id="${listId}">${options.map(opt => `<option value="${opt.omschrijving}">`).join('')}</datalist>`;
    } else {
        omschrijvingInput = `<input type="text" id="omschrijving-${item.id}" class="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm " value="${item.data && item.data.omschrijving ? item.data.omschrijving : ''}"  placeholder="Omschrijving">`;
    }

    const rowBgClass = item.isDuplicate 
        ? 'bg-amber-50/70 hover:bg-amber-100/60' 
        : 'bg-white hover:bg-gray-50';

    return `
        <tr id="batch-row-${item.id}" class="${rowBgClass} border-b transition-colors${isDeselected ? ' opacity-40' : ''}">
            <td class="px-4 py-3 align-middle text-center">
                <input type="checkbox" class="queue-item-select w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    data-item-id="${item.id}"
                    ${item.selected !== false ? 'checked' : ''}>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                <div class="flex items-center gap-2">
                    <i data-lucide="file-text" class="w-4 h-4 text-gray-400"></i>
                    <span class="text-sm font-medium text-gray-900 truncate max-w-[150px]" title="${item.file.name}">${item.file.name}</span>
                </div>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                ${getStatusBadge(item)}
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                <input type="date" id="datum-${item.id}" class="w-full p-2 border rounded outline-none ${dateClasses}" 
                    value="${d.datum || ''}" ${disabledAttr}>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                <input type="text" id="leverancier-${item.id}" class="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm " 
                    value="${currentMode === 'verkoop' ? (d.klantNaam || '') : (d.naamLeverancier || '')}"  placeholder="${currentMode === 'verkoop' ? 'Klant' : 'Leverancier'}">
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                ${omschrijvingInput}
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-right">
                <input type="number" id="factuurbedrag-${item.id}" step="0.01" class="w-24 text-right bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm "
                    value="${currentMode === 'verkoop' ? (d.totaalBedrag || d.factuurBedrag || '') : (d.factuurBedrag || d.totaalBedrag || d.bedrag || '')}"  placeholder="0.00">
                ${d.omgerekend ? `
                    <div id="currency-info-${item.id}" class="text-[10px] text-blue-600 font-mono text-right mt-0.5" title="Omgerekend van ${d.origineelValuta || 'USD'} ${Number(d.origineelBedrag || 0).toFixed(2)} met dagkoers €${d.wisselkoers} op ${d.koersDatum || d.datum}">
                        ${getCurrencySymbol(d.origineelValuta)} ${Number(d.origineelBedrag || 0).toFixed(2)} (@ ${d.wisselkoers})
                    </div>
                ` : ''}
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-right">
                 <input type="number" id="btw-${item.id}" step="0.01" class="w-20 text-right bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm "
                    value="${currentMode === 'verkoop' ? ((parseFloat(d.btwHoog) || 0) + (parseFloat(d.btwLaag) || 0)) : (d.btwBedrag || d.btw || '')}"  placeholder="0.00">
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                <input type="text" id="factuurnummer-${item.id}" class="w-32 bg-transparent border-b border-transparent outline-none text-sm text-gray-500 cursor-default" 
                    value="${d.factuurnummer || ''}" readonly placeholder="Auto (bij opslaan)">
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-center">
                <div class="inline-flex items-center justify-center gap-1.5">
                    <button id="btn-save-${item.id}" onclick="saveBatchItem(${item.id})"
                        class="p-1 ${item.status === 'saved' ? 'text-emerald-500 cursor-default' : 'text-emerald-600 hover:text-emerald-800'} disabled:text-gray-300 transition-colors"
                        ${(item.status !== 'success' && item.status !== 'saved') || isDeselected ? 'disabled' : ''}
                        ${item.status === 'saved' ? 'disabled' : ''}
                        title="${item.status === 'saved' ? 'Opgeslagen' : isDeselected ? 'Uitgeschakeld' : 'Opslaan'}">
                        <i data-lucide="${item.status === 'saved' ? 'check' : 'save'}" class="w-4 h-4"></i>
                    </button>
                    ${item.isDuplicate && item.driveFileId ? `
                        <button type="button" class="trash-drive-btn inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors"
                            data-item-id="${item.id}" title="Direct naar Google Drive Prullenbak verplaatsen">
                            <i data-lucide="trash-2" class="w-3 h-3 pointer-events-none"></i> Prullenbak
                        </button>
                    ` : ''}
                </div>
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-center">
                <button class="delete-item-btn p-1 text-gray-400 hover:text-red-600 transition-colors" data-index="${index}" title="Verwijder item">
                    <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
                </button>
            </td>
        </tr>`;
}

function getStatusBadge(item) {
    if (typeof item === 'string') {
        const status = item;
        switch(status) {
            case 'pending': return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">Wachtend</span>';
            case 'processing': return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 animate-pulse">Scannen...</span>';
            case 'success': return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Gereed</span>';
            case 'error': return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">Fout</span>';
            case 'saved': return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-600 text-white">Opgeslagen</span>';
            default: return '';
        }
    }

    if (item.isDuplicate) {
        return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-900 border border-amber-300 cursor-help" title="${escapeHtml(item.duplicateReason || 'Mogelijk duplicaat')}">Duplicaat</span>`;
    }

    switch(item.status) {
        case 'pending': return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">Wachtend</span>';
        case 'processing': return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 animate-pulse">Scannen...</span>';
        case 'success': return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Gereed</span>';
        case 'error': return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">Fout</span>';
        case 'saved': return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-600 text-white">Opgeslagen</span>';
        default: return '';
    }
}
