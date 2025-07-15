import "dotenv/config"
import fs from "fs";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { shortenHTML } from "../../common/utils/shortenHtmlUtils.js";
import { aiService } from "../AIService/AIService.js";



puppeteer.use(StealthPlugin());

export default class ProductPageService {
    constructor() {
    }

    async getProductPageInfo(page) {
        try {
            const base64Screenshot = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 50 })

            const contentBefore = await page.content();
            fs.writeFileSync(`./output/productPage/contentBefore.html`, contentBefore, 'utf8');
            console.log("Product page html length before shortening", contentBefore.length);

            const shortenedContent = await shortenHTML(page);
            console.log("Product page html length after shortening", shortenedContent.length);
            fs.writeFileSync(`./output/productPage/contentAfter.html`, shortenedContent, 'utf8');

            const productMetadata = await aiService.getProductMetadata(shortenedContent);

            if (!productMetadata) {
                console.log("Couldn't extract product metadata!");
                return;
            }

            const productInfoSection = await this.extractProductInfoSection(page, shortenedContent, productMetadata);
            fs.writeFileSync("./output/productPage/productInfoSection.html", productInfoSection, "utf8");
            console.log("ProductInfoSection Length: ", productInfoSection.length);

            const productInfo = await aiService.getProductInfo(productInfoSection, base64Screenshot);
            if (!productInfo) {
                console.log("Couldn't extract product info!");
                return;
            }

            productInfo.domPaths = {
                ...productInfo.domPaths,
                description: productMetadata.description,
                rating: productMetadata.rating,
                reviewsCount: productMetadata.reviewsCount,
                cartPath: productMetadata.cartUrl,
                category: productMetadata.category
            };

            return productInfo;
        } catch (err) {
            console.error(`Error while getting product page info, pageUrl: ${page.url()}`, err);
        }
    }

    async extractProductInfoSection(page, shortenedContent, domPaths) {
        const selectors = [
            domPaths.name,
            domPaths.price,
            domPaths.discountPrice,
            domPaths.addToCartButton
        ];

        console.log("selectors", selectors);

        try {
            await Promise.any(selectors.map(selector => page.waitForSelector(selector, { timeout: 5000 })));

            const { content, shouldShorten } = await page.evaluate((domPaths, shortenedContent) => {
                const elements = [
                    document.querySelector(domPaths.name),
                    document.querySelector(domPaths.price),
                    document.querySelector(domPaths.discountPrice),
                    document.querySelector(domPaths.addToCartButton)
                ].filter(Boolean);

                console.log("MY: FOUND ", elements.length)

                if (elements.length === 0) {
                    return { content: shortenedContent, shouldShorten: false };
                }

                function containsAllElements(parent) {
                    const foundElements = elements.filter(el => parent.contains(el));
                    return foundElements.length >= 3 || elements.every(el => parent.contains(el));
                }

                let parentElement = elements[0];
                const maxLevels = 6;
                let level = 0;

                while (level < maxLevels) {
                    parentElement = parentElement.parentElement || parentElement;
                    if ((level > 2 && containsAllElements(parentElement)) || parentElement.innerHTML.length >= shortenedContent.length) {
                        break;
                    }
                    level++;
                }

                const finalContent = containsAllElements(parentElement) ? parentElement.innerHTML : shortenedContent;
                return { content: finalContent, shouldShorten: containsAllElements(parentElement) };
            }, domPaths, shortenedContent);

            return shouldShorten ? await shortenHTML(page, content) : content;
        } catch (err) {
            console.log("Couldn't extract product info section!", err.message);
            return shortenedContent;
        }
    }
}