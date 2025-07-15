import axios from "axios";
import { v4 as uuidv4 } from 'uuid';

export async function downloadHtml(urls, usePuppeteer) {
    if (!urls) return [];
    
    console.log(`started downloading, usePuppeteer: ${usePuppeteer}`)
    console.time(`downloadHtml${urls[0]}`);
    const downloadEndpoint = 'http://108.141.28.139/download';
    const finalUrls = Array.isArray(urls) ? urls : [urls];

    const response = await axios.post(downloadEndpoint,
        {
            urls: finalUrls,
            timeout: 60,
            usePuppeteer
        },
        {    
            headers: { 'Content-Type': 'application/json' }
        }
    );

    console.timeEnd(`downloadHtml${urls[0]}`);
    if (response?.data?.length > 0) {
        const status = response.data[0]?.s;
        return status === 200 ? response?.data?.map(item => item.c) : [];
    }

    return [];
}

// export async function downloadHtml(urls, target, pageType, usePuppeteer) {
//     console.log(`started downloading, usePuppeteer: ${usePuppeteer}`)
//     const downloadEndpoint = 'http://localhost:3000/download-htmls';

//     const finalUrls = Array.isArray(urls) ? urls : [urls];
//     const redisKey = `${target}:downloaded-htmls:${uuidv4()}`;

//     const response = await axios.post(downloadEndpoint,
//         {
//             urls: finalUrls,
//             timeout: 60,
//             pageType,
//             usePuppeteer,
//             redisKey
//         },
//         {
//             headers: { 'Content-Type': 'application/json' }
//         }
//     );

//     console.log(response);

//     return "Started download successfully!";
// }