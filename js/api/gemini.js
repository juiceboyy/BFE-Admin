/**
 * Converteert een File object naar een Base64 string (zonder prefix).
 * @param {File} file 
 * @returns {Promise<string>}
 */
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

export async function analyzeReceipt(file) {
    const base64Data = await fileToBase64(file);

    const response = await fetch('/.netlify/functions/scanReceipt', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            base64Data,
            mimeType: file.type
        })
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error.message);
    }

    const textResponse = data.candidates[0].content.parts[0].text;
    
    // Parse de JSON (verwijder eventuele markdown code blocks voor de zekerheid)
    const cleanJson = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(cleanJson);
}