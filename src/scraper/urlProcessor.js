import Queue from "bull";
import dotenv from "dotenv";
import { scrapeStatus } from "../config/constants.js";
import eventEmitter from "../modules/eventEmitter/eventEmitter.js";
import ScrapeScheduler from "../modules/scrapeScheduler/scrapeScheduler.js";
import { logTargetInfo } from "../utils/logger.js";
import ProductListScraper from "./productListScraper/productListScraper.js";
import ProductPageScraper from "./productPageScraper/productPageScraper.js";
dotenv.config();

class UrlProcessor {
    constructor() {
        this.categoryUrlsQueue = new Queue("categoryUrlsQueue", process.env.BULL_REDIS_URL);
        this.productPageUrlsQueue = new Queue("productPageUrlsQueue", process.env.BULL_REDIS_URL);
        this.productListScraper = new ProductListScraper();
        this.productPageScraper = new ProductPageScraper();
    }

    async processDownloadedProductListUrls() {
        console.log("Listening to product list urls queue.");
        this.categoryUrlsQueue.process(async (job) => {
            try {
                const { targetInfo, htmls, lastChunk } = job.data;

                const target = targetInfo.domain;
                const succedeedHtmls = htmls.filter(html => html.s === 200);

                await logTargetInfo(target, `Unsuccessful product list HTMLs: ${htmls.length - succedeedHtmls.length}`);

                await this.productListScraper.scrapeInfo(targetInfo.productListInfo, target, succedeedHtmls);
                if (lastChunk) {
                    await logTargetInfo(target, `Scrape product lists process finished!`);
                    eventEmitter.emit('productListScrapingComplete', targetInfo);
                }
            } catch (err) {
                console.error("Error processing product list urls: ", err);
            }
        })
    }

    async processDownloadedProductPageUrls() {
        console.log("Listening to product page urls queue.");
        this.productPageUrlsQueue.process(async (job) => {
            try {
                const { targetInfo, htmls, lastChunk } = job.data;
                const succedeedHtmls = htmls.filter(html => html.s === 200);
                const target = targetInfo.domain;
                await logTargetInfo(target, `Unsuccessful productPage HTMLs: ${htmls.length - succedeedHtmls.length}`);

                await this.productPageScraper.scrapeInfo(targetInfo.productPageInfo, target, succedeedHtmls);
                if (lastChunk) {
                    await logTargetInfo(target, `Scraping process finished`);

                    const scrapeScheduler = new ScrapeScheduler();

                    const lastScrapeEndTime = new Date();
                    // Update status back to NOT_RUNNING
                    await scrapeScheduler.updateCompetitorScrapeStatus(targetInfo.url, scrapeStatus.NOT_RUNNING, null, lastScrapeEndTime);
                }
            } catch (err) {
                console.error("Error processing product page urls: ", err);
            }
        })
    }
}

const urlProcessor = new UrlProcessor();
export default urlProcessor;