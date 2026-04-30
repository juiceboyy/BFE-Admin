/**
 * js/ui/scanner-row.js
 * Verantwoordelijk voor het genereren van HTML voor de scanner tabel.
 */
import { isDateValidForPeriod } from '../utils/date.js';

export function getBatchRowHTML(item, dateInfo, currentMode = 'inkoop', index) {
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

    return `
        <tr id="batch-row-${item.id}" class="bg-white border-b hover:bg-gray-50 transition-colors${isDeselected ? ' opacity-40' : ''}">
            <td class="px-4 py-3 text-center">
                <input type="checkbox" class="queue-item-select w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                    data-item-id="${item.id}"
                    ${!isDeselected ? 'checked' : ''}
                    ${isDisabled ? 'disabled' : ''}>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                <div class="flex items-center gap-2">
                    <i data-lucide="file-text" class="w-4 h-4 text-gray-400"></i>
                    <span class="text-sm font-medium text-gray-900 truncate max-w-[150px]" title="${item.file.name}">${item.file.name}</span>
                </div>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                ${getStatusBadge(item.status)}
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
                <button id="btn-save-${item.id}" onclick="saveBatchItem(${item.id})"
                    class="p-1 ${item.status === 'saved' ? 'text-green-500 cursor-default' : 'text-green-600 hover:text-green-800'} disabled:text-gray-300 transition-colors"
                    ${(item.status !== 'success' && item.status !== 'saved') || isDeselected ? 'disabled' : ''}
                    ${item.status === 'saved' ? 'disabled' : ''}
                    title="${item.status === 'saved' ? 'Opgeslagen' : isDeselected ? 'Uitgeschakeld' : 'Opslaan'}">
                    <i data-lucide="${item.status === 'saved' ? 'check' : 'save'}" class="w-4 h-4"></i>
                </button>
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-center">
                <button class="delete-item-btn p-1 text-gray-400 hover:text-red-600 transition-colors" data-index="${index}" title="Verwijder item">
                    <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
                </button>
            </td>
        </tr>`;
}

function getStatusBadge(status) {
    switch(status) {
        case 'pending': return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Wachtend...</span>';
        case 'processing': return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">⏳ Scannen...</span>';
        case 'success': return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">✅ Klaar</span>';
        case 'error': return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">❌ Fout</span>';
        case 'saved': return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">💾 Opgeslagen</span>';
        default: return '';
    }
}
