export async function extractJsonObjectFromText(content) {
    // Find the first set of curly braces
    const jsonMatch = content.match(/{[\s\S]*}/);

    if (jsonMatch) {
        const jsonString = jsonMatch[0];
        try {
            return JSON.parse(jsonString);
        } catch (err) {
            console.error("Error parsing JSON:", err);
        }
    } else {
        console.log(`Couldn't match JSON in the given content!`);
    }
}

export function getPriceFromString(priceStr) {
    const parts = priceStr.split(/[,\.']/);
    if (parts.length > 1) {
        const lastPart = parts[parts.length - 1];
        if (lastPart.length <= 2) { // Likely a decimal separator; 
            priceStr = parts.slice(0, -1).join("") + "." + lastPart;
        } else {
            priceStr = parts.join("");
        }
    }

    const parsedPrice = parseFloat(priceStr);
    return isNaN(parsedPrice) ? 0 : parsedPrice;
}