import axios from "axios";
import fs from "fs";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { collectionsEnum } from "../../common/config/constants.js";
import { shortenHTML } from "../../common/utils/shortenHtmlUtils.js";
import { removeErrorListeners, traceErrors } from "../../common/utils/traceErrors.js";
import { getFullUrl } from "../../common/utils/urlUtils.js";
import { aiService } from "../../common/AIService/AIService.js";
import { connectToMongo } from "../../common/db/db.js";
import NavigationService from "../navigationService/navigationService.js";
import ProductPageService from "../productPageService/productPageService.js";
import ProgressTracker from "../../common/progressTracker/progressTracker.js";
import { logErrors } from "../../common/utils/logger.js";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

puppeteer.use(StealthPlugin());

export default class SiteAuditor {
    constructor(url, socket) {
        this.url = url;
        this.domain = new URL(url).hostname.replace("www.", "");
        this.browser = null;
        this.page = null;
        this.navigationService = null;
        this.targetInfo = this.createInitialTargetInfo();
        this.isStopping = false;
        this.progressTracker = socket ? new ProgressTracker(socket) : null;
    }

    createInitialTargetInfo() {
        return {
            url: this.url,
            domain: this.domain,
            reportStartTimeUtc: new Date().toISOString(),
            reportEndTimeUtc: null,
            homePageErrors: this.createErrorCategories(),
            productListErrors: this.createErrorCategories(),
            productPageErrors: this.createErrorCategories(),
            cartPageErrors: this.createErrorCategories()
        };
    }

    createErrorCategories() {
        return {
            sourceCodeErrors: {},
            imageErrors: {},
            apiErrors: {}
        };
    }

    async initBrowser() {
        this.progressTracker?.startTask(5, 2);
        try {
            this.browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1800']
            });
            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1550, height: 1300 });
            this.navigationService = new NavigationService(this.page);
        } catch (err) {
            console.warn("Error initing browser: ", err);
            await logErrors(err);
        } finally {
            this.progressTracker?.completeTask();
        }
    }

    async navigateHomePage(willBeScraped) {
        try {
            this.progressTracker?.startTask(20, 12);
            await traceErrors(this.page, this.targetInfo.homePageErrors);

            await this.page.goto(this.url, { waitUntil: 'networkidle2' });

            const contentBefore = await this.page.content();
            fs.writeFileSync(`./output/homePage/contentBefore.html`, contentBefore, 'utf8');
            console.log("Homepage html length before shortening", contentBefore.length);

            const homePageHtml = await shortenHTML(this.page);
            fs.writeFileSync(`./output/homePage/contentAfter.html`, homePageHtml, 'utf8');
            console.log("Homepage html length after shortening", homePageHtml.length);

            if (!willBeScraped) return;

            const screenshot = await this.page.screenshot({ encoding: "base64", type: "jpeg", quality: 50 });
            const categorySelectors = await aiService.getCategorySelectors(homePageHtml, screenshot);
            this.targetInfo.categorySelectors = categorySelectors;

            const homePageInfo = await this.scrapeCategories(categorySelectors);
            homePageInfo.crawlMethod = await this._getCrawlMethod(this.url);
            this.targetInfo.homePageInfo = homePageInfo;
        } catch (err) {
            console.warn("Error navigating homepage", err);
            await logErrors(err);
        }
        finally {
            removeErrorListeners(this.page);
            this.progressTracker?.completeTask();
        }
    }

    async navigateProductList(willBeScraped) {
        try {
            this.progressTracker?.startTask(30, 20);
            await traceErrors(this.page, this.targetInfo.productListErrors);

            const categoryUrls = this.targetInfo.categorySelectors?.categoryUrls;
            if (!categoryUrls) {
                throw new Error(`No category url found for: ${this.domain}`);
            }

            let productListInfo;
            for (let i = 0; i < categoryUrls.length; i++) {
                const categoryUrl = categoryUrls[i];

                const productListUrl = await this.navigationService.navigateToProductList(categoryUrl);
                const contentBefore = await this.page.content();
                fs.writeFileSync(`./output/productList/contentBefore.html`, contentBefore, 'utf8');
                console.log("ProductList html length before shortening", contentBefore.length);

                const productListHtml = await shortenHTML(this.page, null, ['nav'], ['filters'], 120_000);
                fs.writeFileSync(`./output/productList/contentAfter.html`, productListHtml, 'utf8');
                console.log("ProductList html length after shortening", productListHtml.length);

                if (!willBeScraped) return;

                let aiResponse = await aiService.getProductUrls(productListHtml);
                aiResponse.url = productListUrl;

                if (i === 0) // The first categoryUrl
                {
                    productListInfo = aiResponse;
                    productListInfo.crawlMethod = await this._getCrawlMethod(productListUrl);
                }
                else {
                    productListInfo.productUrls = [...productListInfo.productUrls, ...aiResponse.productUrls];
                }
            }

            this.targetInfo.productListInfo = productListInfo;
        } catch (err) {
            console.error("Error navigating product list", err);
            await logErrors(err);
        } finally {
            this.progressTracker?.completeTask();
            removeErrorListeners(this.page);
        }
    }

    async isProductPage() {
        const screenshot = await this.page.screenshot({ encoding: "base64", type: "jpeg", quality: 50, fullPage: true })
        return await aiService.isProductPage(screenshot);
    }

    async navigateProductPage(willBeScraped) {
        this.progressTracker?.startTask(45, 35);
        try {
            await traceErrors(this.page, this.targetInfo.productPageErrors);

            this.page.on('console', async (msg) => {
                if (msg.type() === "log" && msg.text() && msg.text().startsWith("MY:")) {
                    console.log("Logged from puppeter: ", msg.text().replace("MY: ", ""));
                }
            });

            const productUrls = this.targetInfo.productListInfo.productUrls;

            let productPageInfo;
            for (let i = 0; i < productUrls.length; i++) {
                let productLink = productUrls[i];

                let productUrl = await this.navigationService.navigateToProductPage(productLink);

                if (i === 0 && !await this.isProductPage()) {
                    console.log(`Not product page! Url: ${productUrl}`);
                    productUrl = await this.retryNavigateProductPage();
                }

                if (!willBeScraped) break;

                const productService = new ProductPageService();
                let aiResponse = await productService.getProductPageInfo(this.page) || {};
                aiResponse.url = productUrl;
                if (i === 0) // The first productUrl
                {
                    productPageInfo = aiResponse;
                    productPageInfo.crawlMethod = await this._getCrawlMethod(productUrl);
                } else {
                    productPageInfo[`domPaths${i + 1}`] = aiResponse.domPaths;
                }
            }
            this.targetInfo.productPageInfo = productPageInfo;

            this.targetInfo.cartUrl = await this.navigationService.navigateToCart(this.targetInfo.productPageInfo);
        } catch (err) {
            console.error("Error navigating product page", err);
            await logErrors(err);
        }
        finally {
            removeErrorListeners(this.page);
            this.progressTracker?.completeTask();
        }
    }

    async retryNavigateProductPage() {
        const contentBefore = await this.page.content();
        fs.writeFileSync(`./output/productList/contentBefore.html`, contentBefore, 'utf8');
        console.log("ProductList html length before shortening", contentBefore.length);

        const productListHtml = await shortenHTML(this.page, null, ['nav'], ['filters'], 120_000);
        fs.writeFileSync(`./output/productList/contentAfter.html`, productListHtml, 'utf8');
        console.log("ProductList html length after shortening", productListHtml.length);

        const updatedProductListInfo = await aiService.getProductUrls(productListHtml);

        removeErrorListeners(this.page);
        await traceErrors(this.page, this.targetInfo.productPageErrors);

        return await this.navigationService.navigateToProductPage(updatedProductListInfo.productUrls);
    }

    async calculateTotalErrors(targetInfo, errorType) {
        const homePageErrors = Object.values(targetInfo.homePageErrors[errorType]).reduce((sum, count) => sum + count, 0);
        const productListErrors = Object.values(targetInfo.productListErrors[errorType]).reduce((sum, count) => sum + count, 0);
        const productPageErrors = Object.values(targetInfo.productPageErrors[errorType]).reduce((sum, count) => sum + count, 0);
        const cartPageErrors = Object.values(targetInfo.cartPageErrors[errorType]).reduce((sum, count) => sum + count, 0);

        return homePageErrors + productListErrors + productPageErrors + cartPageErrors;
    }

    async scrapeCategories(selectors) {
        const { mainCategorySelector, categorySelector, subCategorySelector, promotedCategories } = selectors;

        const categoriesFound = new Set();
        async function getCategoryText(selector, page) {
            selector = selector.replace(/>/g, "");
            try {
                await page.waitForSelector(selector, { timeout: 2000 });

                let categories = await page.$$eval(selector, (elements) => {
                    return elements.map(el => {
                        const name = (el.innerText || el.textContent)?.trim().replace(/\s+/g, ' ').split('\n')[0];
                        if (!name || name.length > 100) {
                            return null;
                        }

                        let url = el.tagName.toLowerCase() === 'a' ? el.href : el.querySelector('a')?.href?.trim();
                        if (!url) {
                            url = el.parentElement.parentElement.querySelector('a')?.href?.trim();
                        }

                        return name && url ? { name, url } : null;
                    }).filter(Boolean)
                }
                );

                categories = categories.map(category => ({
                    ...category,
                    url: getFullUrl(category.url)
                }));

                const uniqueCategories = categories.filter(({ name, url }) => {
                    const categoryKey = `${url}`;
                    if (categoriesFound.has(categoryKey)) {
                        return false;
                    }

                    categoriesFound.add(categoryKey);
                    return true;
                });

                return uniqueCategories;
            } catch (error) {
                console.log(`No category found with selector: ${selector}`);
                await logErrors(error);
                return [];
            }
        }

        let mainCategories = mainCategorySelector ? await getCategoryText(mainCategorySelector, this.page) : [];
        let categories = categorySelector ? await getCategoryText(categorySelector, this.page) : [];
        let subCategories = subCategorySelector ? await getCategoryText(subCategorySelector, this.page) : [];

        return {
            mainCategories,
            categories,
            subCategories,
            promotedCategories
        };
    }

    async addTargetInfo(targetInfo) {
        try {
            const db = await connectToMongo();
            const result = await db.collection(collectionsEnum.TARGETS_INFO).insertOne(targetInfo);
            console.log('Target info added with ID:', result.insertedId);
            return result;
        } catch (err) {
            await logErrors(err);
            console.error('Error adding target info:', err);
        }
    }

    async audit(willBeScraped = false) {
        try {
            await this.initBrowser();
            if (this.isStopping) return;

            await this.navigateHomePage(willBeScraped);
            if (this.isStopping) return;

            await this.navigateProductList(willBeScraped);
            if (this.isStopping) return;

            await this.navigateProductPage(willBeScraped);
            if (this.isStopping) return;

            this.targetInfo.reportEndTimeUtc = new Date().toISOString();

            await this.addTargetInfo(this.targetInfo);
            return {
                totalSourceCodeErrors: await this.calculateTotalErrors(this.targetInfo, 'sourceCodeErrors'),
                totalApiErrors: await this.calculateTotalErrors(this.targetInfo, 'apiErrors'),
                totalImageErrors: await this.calculateTotalErrors(this.targetInfo, 'imageErrors')
            };
        } catch (err) {
            await logErrors(err);
            console.error(`Error while auditing page: ${this.url}`, err);
        } finally {
            await this.browser?.close();
        }
    }

    stopAudit() {
        this.isStopping = true;
    }

    async _getCrawlMethod(url) {
        try {
            // console.time("Crawl method");
            // const downloadEndpoint = 'http://108.141.28.139/download';
            const endpoint = 'http://108.142.177.182:3000/crawl-method-checker-v2';
            const response = await axios.post(endpoint,
                {
                    url
                },
                {
                    headers: { 'Content-Type': 'application/json' }
                }
            );
            // console.timeEnd("Crawl method");
            return response?.data?.method?.method;
        }
        catch (error) {
            console.log("Error while getting crawl method!", error.message);
            await logErrors(error);
        }
    }
}

// const url = 'https://nikin.ch/';
// const auditor = new SiteAuditor(url);
// await auditor.audit(true);