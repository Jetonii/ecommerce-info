import Queue from "bull";
import "dotenv/config"

// Queues urls to be downloaded by the internalLinkCrawler 
export async function downloadHtmls(urls, crawlMethod, urlType, targetInfo, categoryNames, lastChunk = false) {
    try {
        const queue = new Queue("audit:downloadHtmlsQueue", process.env.BULL_REDIS_URL);
        await queue.add({
            urls,
            crawlMethod,
            urlType,
            targetInfo,
            categoryNames,
            lastChunk,
        }, {
            // ttl: 24 * 3600 * 1000, // 24 hours
            removeOnComplete: true,
            removeOnFail: true,
        });

        console.log(`Urls: ${urls.length}, UrlType: ${urlType}, Task added to the queue successfully`, targetInfo.domain);
    } catch (error) {
        console.error('Error during the request:', error.response?.data || error.message);
        throw error;
    }
}
