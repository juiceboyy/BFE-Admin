export function initScanner() {
    const uploadInput = document.getElementById('receipt-upload');
    const editForm = document.getElementById('receipt-edit-form');

    if (uploadInput && editForm) {
        uploadInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                console.log("Bestand geselecteerd:", file.name);
                
                // Toon het formulier
                editForm.classList.remove('hidden');
                
                // Scroll naar het formulier voor betere UX
                editForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }
}