// export function isValidUrl(url) {
//     try {
//         new URL(url.startsWith("http") ? url : `https://${url}`);
//         return true;
//     } catch (err) {
//         return false;
//     }
// }

export function isValidUrl(url) {
  try {
    const formattedUrl = new URL(url.startsWith("http") ? url : `https://${url}`);

    return !!formattedUrl.hostname && formattedUrl.hostname.includes(".");
  } catch {
    return false;
  }
}

// export function getFullUrl(path, domain) {
//     try {
//         return new URL(path, `https://${domain}`).href;
//     } catch (err) {
//         console.log("Error while getting fullUrl: ", err);
//     }
// }

export function getFullUrl(path = "", domain = "") {
  try {
    if (!domain) return path.startsWith("http") ? path : null;
    return new URL(path, domain.startsWith("http") ? domain : `https://${domain}`).href;
  } catch (err) {
    console.error("Error while getting full URL:", err);
    return null;
  }
} 