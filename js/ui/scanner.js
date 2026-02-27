import { analyzeReceipt } from '../api/gemini.js';
import { uploadToDrive, insertRowInSheet } from '../api/storage.js';

export function initScanner() {
    const uploadInput = document.getElementById('receipt-upload');
    const editForm = document.getElementById('receipt-edit-form');
    let currentFile = null;

    const getNextInvoiceNumber = () => {
        const year = new Date().getFullYear();
        const seq = parseInt(localStorage.getItem('nextInvoiceSeq') || '1', 10);
        const paddedSeq = seq.toString().padStart(3, '0');
        return `${year}.${paddedSeq}`;
    };

    if (uploadInput && editForm) {
        uploadInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                currentFile = file;
                // UI Loading State
                const label = uploadInput.parentElement.querySelector('p.font-medium');
                const originalText = label.innerText;
                label.innerText = 'Bon wordt geanalyseerd door AI...';

                try {
                    const data = await analyzeReceipt(file);
                    
                    // Populate form inputs
                    document.getElementById('scan-factuurnummer').value = getNextInvoiceNumber();
                    document.getElementById('scan-datum').value = data.datum || '';
                    
                    // Leverancier en Memory Logic
                    const leverancier = data.naamLeverancier || '';
                    document.getElementById('scan-leverancier').value = leverancier;

                    let omschrijving = data.omschrijving || '';
                    let tarief = data.btwTarief || '21';

                    if (leverancier) {
                        const memory = JSON.parse(localStorage.getItem('vendor_' + leverancier.toLowerCase().trim()));
                        if (memory) {
                            omschrijving = memory.omschrijving || omschrijving;
                            tarief = memory.btwTarief || tarief;
                        }
                    }

                    document.getElementById('scan-omschrijving').value = omschrijving;
                    document.getElementById('scan-bedrag').value = data.bedragExclusief || '';
                    document.getElementById('scan-tarief').value = tarief;
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

        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = editForm.querySelector('button[type="submit"]');
            const originalBtnContent = submitBtn.innerHTML;
            
            // Laad-status tonen
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Bezig met opslaan...';
            lucide.createIcons();

            try {
                // Waarden ophalen
                const factuurnummer = document.getElementById('scan-factuurnummer').value;
                const datum = document.getElementById('scan-datum').value;
                const leverancier = document.getElementById('scan-leverancier').value;
                const omschrijving = document.getElementById('scan-omschrijving').value;
                const bedrag = parseFloat(document.getElementById('scan-bedrag').value) || 0;
                const tarief = document.getElementById('scan-tarief').value;
                const btwBedrag = parseFloat(document.getElementById('scan-btw-bedrag').value) || 0;

                // Save Memory
                if (leverancier) {
                    localStorage.setItem('vendor_' + leverancier.toLowerCase().trim(), JSON.stringify({ omschrijving: omschrijving, btwTarief: tarief }));
                }

                // 1. Uploaden naar Drive (als er een bestand is)
                if (currentFile) {
                    await uploadToDrive(currentFile, factuurnummer);
                }

                // 2. Toevoegen aan Sheet (Datum, Factuurnummer, Omschrijving, Leverancier, Totaal, Btw, Excl)
                await insertRowInSheet([datum, factuurnummer, omschrijving, leverancier, bedrag + btwBedrag, btwBedrag, bedrag]);

                // Update sequence in localStorage
                const parts = factuurnummer.split('.');
                if (parts.length === 2) {
                    const seq = parseInt(parts[1], 10);
                    if (!isNaN(seq)) {
                        localStorage.setItem('nextInvoiceSeq', seq + 1);
                    }
                }

                alert('Bon succesvol opgeslagen!');
                editForm.reset();
                editForm.classList.add('hidden');
                currentFile = null;
                uploadInput.value = ''; // Reset file input
            } catch (error) {
                console.error('Fout bij opslaan:', error);
                alert('Er ging iets mis bij het opslaan: ' + error.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnContent;
                lucide.createIcons();
            }
        });
    }
}