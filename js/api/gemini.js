function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            // Verwijder de data URL prefix (bijv. "data:image/jpeg;base64,")
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = (error) => reject(error);
    });
}

export async function analyzeReceipt(file, cloudMemory) {
    const base64Data = await fileToBase64(file);

    const response = await fetch('/.netlify/functions/scanReceipt', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            base64Data,
            mimeType: file.type,
            cloudMemory
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server error: ${response.status}`);
    }

    const data = await response.json();
    return data;
}