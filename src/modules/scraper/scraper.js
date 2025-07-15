import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { collectionsEnum } from "../../common/config/constants.js";
import eventEmitter from "../common/eventEmitter/eventEmitter.js";
import { logErrors, logInfo } from "../common/utils/logger.js";
import { shortenHTML } from "../common/utils/shortenHtmlUtils.js";
import { AIHandler, aiService } from "../modules/AIService/AIService.js";
import { connectToClickHouse, connectToMongo } from "../modules/db/db.js";
import SiteAuditor from "../modules/siteAuditor/siteAuditor.js";
import HomePageScraper from "./homePageScraper/homePageScraper.js";
import HomePageScraper 
import ProductListScraper from "./productListScraper/productListScraper.js";
import ProductPageScraper from "./productPageScraper/productPageScraper.js";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

puppeteer.use(StealthPlugin());

class Scraper {
    constructor(url) {
        this.url = url;
        this.page = null;
        this.domain = new URL(url).hostname.replace("www.", "");
        this.homePageScraper = new HomePageScraper();
        this.productListScraper = new ProductListScraper();
        this.productPageScraper = new ProductPageScraper();
        this.aiHandler = new AIHandler(process.env.OPENAI_API_KEY);
    }

    // Audits site once in 7 days
    async tryAuditSite(siteUrl) {
        if (!siteUrl) throw new Error("Site URL must be provided");

        const { reportStartTimeUtc } = await this.getCompetitorInfo(siteUrl) || {};
        const needsAudit = !reportStartTimeUtc || (Date.now() - new Date(reportStartTimeUtc)) > 604_800_000; // 7 days  

        if (needsAudit) {
            console.log(`Auditing site: ${siteUrl}, lastAudited: ${reportStartTimeUtc}!`);
            await new SiteAuditor(siteUrl).audit(true);
        }
        return await this.getCompetitorInfo(siteUrl);
    }

    async getCompetitorInfo(url) {
        try {
            const db = await connectToMongo();
            const collection = await db.collection(collectionsEnum.TARGETS_INFO);
            const result = await collection.find(
                { url: url },
            ).sort({ _id: -1 }).limit(1).toArray();

            return result[0] || null;
        } catch (err) {
            console.error('Error adding target info:', err);
        }
    }

    async initBrowser() {
        try {
            this.browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1800']
            });
            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1550, height: 1300 });
        } catch (err) {
            console.warn("Error initing browser: ", err);
            await logErrors(err);
        }
    }

    async checkForPromotion(siteUrl) {
        console.log('Checking for promotion in: ', siteUrl)
        if (!this.page) await this.initBrowser();
        await this.page?.goto(siteUrl, { waitUntil: 'networkidle2', timeout: 60_000 });
        const html = await shortenHTML(this.page)
        const screenshot = await this.page.screenshot({ encoding: "base64", type: "jpeg", quality: 50, fullPage: true });

        return await aiService.getPromotion(html, screenshot)
    }

    async savePromotion(params) {
        const db = await connectToClickHouse();

        await db.insert({
            table: 'aiScraper.competitor_promotions',
            // ClickHouse likes JSONEachRow for small inserts
            format: 'JSONEachRow',
            values: [
                {
                    target: params.target,
                    url: params.url,
                    date: (params.date ?? new Date()).toISOString().substring(0, 10),
                    hasPromotion: params.hasPromotion ? 1 : 0,
                    promotionRate: params.promotionRate,
                },
            ],
        });
    };

    async scrape(target) {
        try {
            const competitorInfo = await this.tryAuditSite(this.url);
            if (!competitorInfo) return;

            if (!competitorInfo?.productPageInfo?.domPaths) return;

            await logInfo(`Started scraping competitor:  ${competitorInfo.domain}!`)
            const aiResponse = await this.checkForPromotion(this.url)
            console.log('aiResponse', aiResponse)
            await this.savePromotion({ hasPromotion: aiResponse.hasPromotion, promotionRate: aiResponse.promotionRate, target: this.domain, url: this.url })

            await this.homePageScraper.copyFromMongo(competitorInfo.homePageInfo, this.domain);
            await this.homePageScraper.findMatchedCategories(target, this.domain, competitorInfo.homePageInfo);
            await this.productListScraper.startScraping(competitorInfo);

            eventEmitter.once('productListScrapingComplete', async (competitorInfo) => {
                await logInfo(`Started scraping product pages for competitor: ${competitorInfo.domain}!`)
                await this.productPageScraper.startScraping(competitorInfo);
            })
        } catch (error) {
            console.error(`Error happened while scraping ${this.url}`, error);
        }
    }
}

export default Scraper;