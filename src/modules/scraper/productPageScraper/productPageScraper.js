import { load } from 'cheerio';
import { urlTypeEnum } from '../../../common/config/constants.js';
import { chunkArray } from '../../../common/utils/arrayUtils.js';
import { downloadHtmls } from '../../../common/utils/linkCrawlerUtils.js';
import { getPriceFromString } from '../../../common/utils/parserUtils.js';
import productUrlRepo from '../productListScraper/productUrlRepo.js';
import productDetailsRepo from './productDetailsRepo.js';

export default class ProductPageScraper {
    constructor() {
        this.productDetailsRepo = productDetailsRepo;
        this.productUrlRepo = productUrlRepo;
    }

    async startScraping(targetInfo) {
        console.log("Started scraping product pages for domain: ", targetInfo.domain);
        let productUrls = await this.productUrlRepo.getProductUrlsByTarget(targetInfo.domain);
        // productUrls = productUrls.slice(0, 2);
        if (!productUrls) {
            console.log(`No products found for domain: ${targetInfo.domain}.`);
            return;
        }

        const chunkSize = 50;
        const productUrlChunks = chunkArray(productUrls, chunkSize);

        for (let i = 0; i < productUrlChunks.length; i++) {
            const chunk = productUrlChunks[i];
            const isLastChunk = (i === productUrlChunks.length - 1);

            const productUrls = chunk.map((c) => c.url);
            const categories = chunk.map((c) => c.category);

            await downloadHtmls(
                productUrls,
                targetInfo.productPageInfo?.crawlMethod,
                urlTypeEnum.PRODUCT_PAGE,
                targetInfo,
                categories,
                isLastChunk,
            );
        }
    }

    async scrapeInfo(productPageInfo, domain, htmls) {
        const scrapeDate = new Date().toISOString();

        try {
            const scrapedProducts = [];
            for (let i = 0; i < htmls.length; i++) {
                const productPageHtml = htmls[i].c;
                const url = htmls[i].u;
                const category = htmls[i].category;
                try {
                    const scrapedDetails = await this.extractProductDetails(
                        productPageHtml,
                        [productPageInfo?.domPaths, productPageInfo?.domPaths2, productPageInfo?.domPaths3],
                        url,
                        category
                    );

                    scrapedProducts.push(scrapedDetails);
                } catch (error) {
                    console.log(`Error while extracting product details! Url: ${url}`, error);
                }
            }

            await this.productDetailsRepo.detectAndInsertChanges(domain, scrapedProducts, scrapeDate);

            console.log(`Finished scraping product details for ${domain}`);
        } catch (error) {
            console.error(`Error scraping product page info! Domain: ${domain}:`, error);
        }
    }

    async extractProductDetails(html, paths, url, category) {
        const $ = load(html);

        const pricePaths = paths.map(p => p.price);
        const discountPricePaths = paths.map(p => p.discountPrice);
        const namePaths = paths.map(p => p.name);
        const allSizesPaths = paths.map(p => p.allSizes);
        const availableSizesPaths = paths.map(p => p.availableSizes);
        const disabledAddToCartButtonPaths = paths.map(p => p.disabledAddToCartButton);
        const addToCartButtonPaths = paths.map(p => p.addToCartButton);
        const reviewsCountPaths = paths.map(p => p.reviewsCount);
        const ratingPaths = paths.map(p => p.rating);
        const categoryPaths = paths.map(p => p.category);
        const descriptionPaths = paths.map(p => p.description);

        const priceInfo = this._extractPriceAndCurrency(this._extractText($, pricePaths));
        // console.log("price info: ", priceInfo);
        const discountPriceInfo = this._extractPriceAndCurrency(this._extractText($, discountPricePaths));
        // console.log("discount price info: ", discountPriceInfo);

        const rating = this._extractRating($, ratingPaths);
        return {
            url,
            name: this._extractText($, namePaths) || null,
            formerPrice: Math.max(priceInfo.price, discountPriceInfo.price),
            price: Math.min(priceInfo.price, discountPriceInfo.price) || priceInfo.price || discountPriceInfo.price,
            currency: priceInfo.currency || discountPriceInfo.currency || 'N/A',
            all_sizes: this._extractSizes($, allSizesPaths),
            available_sizes: this._extractSizes($, availableSizesPaths),
            available: this._findElement($, disabledAddToCartButtonPaths) ? false : true, // If disabledAddToCartButton exists unavailable, else available 
            reviews: this._extractReviews($, reviewsCountPaths) || null,
            rating: rating > 5 ? 5 : rating || null,
            category: category || this._extractText($, categoryPaths) || "",
            description: this._extractText($, descriptionPaths) || null
        };
    }

    _extractPriceAndCurrency(priceText) {
        if (!priceText) return { price: 0, currency: null };

        const match = priceText.match(/([^\d\s.,']*?)\s*([\d.,']+)\s*([^\d\s.,']*)/);
        if (match) {
            const currencyBefore = match[1].trim(); // Currency before the number
            const priceStr = match[2];
            const currencyAfter = match[3].trim(); // Currency after the number

            const currency = currencyAfter || currencyBefore || null;

            return { price: getPriceFromString(priceStr), currency };
        }

        return { price: 0, currency: null };
    };

    _extractSizes($, selectors) {
        if (!selectors || selectors.length === 0) return [];
        const sizes = [];

        for (const selector of selectors) {
            // Select all elements matching the selector
            $(selector).each((_, element) => {
                const size = $(element).text().trim();
                if (size) {
                    sizes.push(size);
                }
            });

            if (sizes?.length > 0) {
                return sizes;
            }
        }

        return [];
    }

    _extractReviews($, selectors) {
        if (!selectors) return null;

        const text = this._extractText($, selectors);
        if (!text) return null;

        // Case 1: Rating format with parentheses: "4.5(30)", "4.5 (30)"
        const parenthesesMatch = text.match(/\((\d+(?:,\d+)*)\)/);
        if (parenthesesMatch) {
            return parseInt(parenthesesMatch[1].replace(/,/g, ''), 10);
        }

        // Case 2: Format with review count after rating separated by dash, slash, or pipe: "4.5 - 30", "4.5/30", "4.5|30"
        const separatorMatch = text.match(/[\d.]+\s*[-/|]\s*(\d+(?:,\d+)*)/);
        if (separatorMatch) {
            return parseInt(separatorMatch[1].replace(/,/g, ''), 10);
        }

        // Case 3: Format with review count in square brackets: "4.5[30]", "4.5 [30]"
        const bracketsMatch = text.match(/\[(\d+(?:,\d+)*)\]/);
        if (bracketsMatch) {
            return parseInt(bracketsMatch[1].replace(/,/g, ''), 10);
        }

        // Case 4: Multiple numbers - take the largest one
        const multipleNumbers = text.match(/\d+(?:,\d+)*/g);
        if (multipleNumbers && multipleNumbers.length > 1) {
            return parseInt(multipleNumbers[multipleNumbers.length - 1].replace(/,/g, ''), 10);
        }

        // Case 5: Any number as last resort
        const anyNumber = text.match(/\d+(?:,\d+)*/);
        if (anyNumber) {
            return parseInt(anyNumber[0].replace(/,/g, ''), 10);
        }

        return null;
    }

    _extractRating($, selectors) {
        if (!selectors) return null;

        const text = this._extractText($, selectors);
        if (!text) return null;

        // Case: "4.5 out of 5"
        const outOfMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:out of|\/)\s*(\d+)/i);
        if (outOfMatch) {
            const rating = parseFloat(outOfMatch[1]);
            const scale = parseFloat(outOfMatch[2]);
            return scale === 5 ? rating : (rating / scale) * 5; // Normalize to 5-star scale
        }

        // Case: Percentage ratings like "90%"
        const percentMatch = text.match(/(\d+(?:\.\d+)?)%/);
        if (percentMatch) {
            return (parseFloat(percentMatch[1]) / 100) * 5; // Convert to 5-star scale
        }

        // Case: Standard decimal rating
        const decimalMatch = text.match(/(\d+(?:\.\d+)?)/);
        if (decimalMatch) {
            const rating = parseFloat(decimalMatch[0]);
            // If rating is likely on a 10-point scale, normalize to 5
            return rating > 5 && rating <= 10 ? rating / 2 : rating;
        }

        return null;
    }

    _isAvailable($, selector) {
        const text = this._extractText($, selector)?.toLowerCase();

        const unavailableKeywords = [
            'out of stock',
            'unavailable',
            'sold out',
            'not available'
        ];

        for (const keyword of unavailableKeywords) {
            if (text.includes(keyword)) {
                return false;
            }
        }

        return true;
    }

    _findElement($, selectors) {
        for (const selector of selectors) {
            const element = $(selector).first();
            if (element.length) {
                return element;
            }
        }
        return null;
    }

    _extractText($, selectors, cleanFn) {
        let i = 1;
        for (const selector of selectors) {
            const element = $(selector).first();
            let text = element.text().replace(/\s+/g, ' ').trim();
            const result = cleanFn ? cleanFn(text) : text;
            if (result) {
                // console.log("Found at nth path iteration: ", i++);
                return result;
            }
        };

        return null;
    }
}
