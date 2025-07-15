import { load } from 'cheerio';
import { urlTypeEnum } from '../../../common/config/constants.js';
import { chunkArray } from '../../../common/utils/arrayUtils.js';
import { downloadHtmls } from '../../../common/utils/linkCrawlerUtils.js';
import { getFullUrl } from '../../../common/utils/urlUtils.js';
import categoryRepo from '../homePageScraper/categoryRepo.js';
import productUrlRepo from './productUrlRepo.js';

export default class ProductListScraper {
    constructor() {
        this.categoryRepo = categoryRepo;
        this.productUrlRepo = productUrlRepo;
        this.existingProductUrls = null;
    }

    async startScraping(targetInfo) {
        console.log("Started scraping product lists for domain: ", targetInfo.domain);
        let categories = await this.categoryRepo.getCategoriesByTarget(targetInfo.domain);
        // categories = categories.slice(0, 2);
        const chunkSize = 50;
        const categoryChunks = chunkArray(categories, chunkSize);

        for (let i = 0; i < categoryChunks.length; i++) {
            const chunk = categoryChunks[i];
            const isLastChunk = (i === categoryChunks.length - 1);

            const categoryUrls = chunk.map((c) => c.url);
            const categoryNames = chunk.map((c) => c.name);

            await downloadHtmls(
                categoryUrls,
                targetInfo.productListInfo?.crawlMethod,
                urlTypeEnum.CATEGORY,
                targetInfo,
                categoryNames,
                isLastChunk
            );
        }
    }

    async scrapeInfo(productListInfo, domain, htmls) {
        const { productNameSelector, productUrlSelector } = productListInfo;

        const existingProductUrls = await this.productUrlRepo.getProductUrlsByTarget(domain);
        const productsFound = new Set(existingProductUrls.map(p => p.url));

        const products = [];
        for (let i = 0; i < htmls.length; i++) {
            const productListHtml = htmls[i].c;
            const category = htmls[i].category;

            const productUrls = await this.extractProducts(
                productListHtml,
                productNameSelector,
                productUrlSelector,
                productsFound,
                category,
                domain
            );

            if (productUrls && productUrls.length > 0) {
                products.push(...productUrls);
            }
        }

        await this.saveToClickHouse(products, domain);
    }

    async extractProducts(html, nameSelector, urlSelector, productsFound, category, domain) {
        const $ = load(html);
        const allProducts = [];

        const elements = $(nameSelector);
        elements.each((index, el) => {
            const name = $(el).text().trim().replace(/\s+/g, ' ').split('\n')[0];
            let url = $(el).is('a') ? $(el).attr('href') : $(el).find('a').attr('href');
            if (!url) {
                url = $(el).closest('a').attr('href');
            }
            if (name && url) {
                allProducts.push({
                    name,
                    url: getFullUrl(url, domain),
                    category
                });
            }
        });

        const uniqueProducts = [];

        allProducts.forEach(({ name, url, category }) => {
            const productKey = url;
            if (!productsFound.has(productKey)) {
                productsFound.add(productKey);
                uniqueProducts.push({
                    name,
                    url,
                    category,
                    position: uniqueProducts.length + 1
                });
            }
        });

        return uniqueProducts;
    }

    async saveToClickHouse(productUrls, domain) {
        console.log(`Saving ${productUrls?.length || 0} product urls to clickhouse!`);
        if (productUrls && productUrls.length > 0) {
            await this.productUrlRepo.create(domain, productUrls);
        }
    }
}
