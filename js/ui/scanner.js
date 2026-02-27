import { analyzeReceipt } from '../api/gemini.js';

export function initScanner() {
    const uploadInput = document.getElementById('receipt-upload');
    const editForm = document.getElementById('receipt-edit-form');

    if (uploadInput && editForm) {
        uploadInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                // UI Loading State
                const label = uploadInput.parentElement.querySelector('p.font-medium');
                const originalText = label.innerText;
                label.innerText = 'Bon wordt geanalyseerd door AI...';

                try {
                    const data = await analyzeReceipt(file);
                    
                    // Populate form inputs
                    document.getElementById('scan-factuurnummer').value = data.factuurnummer || '';
                    document.getElementById('scan-datum').value = data.datum || '';
                    document.getElementById('scan-omschrijving').value = data.omschrijving || '';
                    document.getElementById('scan-bedrag').value = data.bedragExclusief || '';
                    document.getElementById('scan-tarief').value = data.btwTarief || '21';
                    document.getElementById('scan-btw-bedrag').value = data.btwBedrag || '';

                    // Unhide form
                    editForm.classList.remove('hidden');
                    editForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } catch (error) {
                    console.error("Fout bij analyse:", error);
                    alert("Kon de bon niet automatisch lezen. Vul de gegevens handmatig in.");
                    editForm.classList.remove('hidden');
                } finally {
                    // Reset loading state
                    label.innerText = originalText;
                }
            }
        });
    }
}