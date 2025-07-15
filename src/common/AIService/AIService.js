import "dotenv/config"
import fs from "fs";
import OpenAI from "openai";
import { collectionsEnum } from '../../common/config/constants.js';
import { extractJsonObjectFromText } from '../utils/parserUtils.js';
import { connectToMongo } from '../db/db.js';

export const AIModels = {
    GPT4: "gpt-4o",
    GPT4MINI: "gpt-4o-mini",
    GPT4_1: "gpt-4.1",
    GPT4_1_MINI: "gpt-4.1-mini"
};

class AIHandler {
    constructor(apiKey) {
        this.openai = new OpenAI({ apiKey });
    }

    async askUsingImage(base64Image, content, model, maxTokens) {
        try {
            // console.time("askUsingImage");
            const url = `data:image/jpeg;base64,${base64Image}`;

            const requestPayload = {
                model: model,
                messages: [
                    { role: "system", content: "You are a web scraper expert." },
                    {
                        role: "user", content: [
                            {
                                type: "text",
                                text: content
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: url,
                                    detail: "low"
                                }
                            }
                        ]
                    },
                ],
                temperature: 0.1,
                response_format: { type: "json_object" }
            };

            if (maxTokens) {
                requestPayload.max_tokens = maxTokens;
            }

            const response = await this.openai.chat.completions.create(requestPayload);

            await this._saveAIUsageReport(response.usage, model);

            fs.writeFileSync(`output/aiImageResponse.txt`, `${JSON.stringify(response.usage)}\n ${response.choices[0].message.content}`, 'utf8');
            // console.timeEnd("askUsingImage");
            return response.choices[0].message.content;
        } catch (err) {
            console.error("Error with OpenAI API:", err);
        }
    }

    async askUsingText(content, model, maxTokens) {
        try {
            const requestPayload = {
                model: model,
                messages: [
                    { role: "system", content: "You are a web scraper expert." },
                    { role: "user", content: content },
                ],
                temperature: 0.1,
                response_format: { type: "json_object" }
            };

            if (maxTokens) {
                requestPayload.max_tokens = maxTokens;
            }

            const response = await this.openai.chat.completions.create(requestPayload);

            await this._saveAIUsageReport(response.usage, model);

            fs.writeFileSync(`output/aiResponse.txt`, `${JSON.stringify(response.usage)}\n ${response.choices[0].message.content}`, 'utf8');
            return response.choices[0].message.content;
        } catch (err) {
            console.error("Error while prompting OpenAI API:", err);
        }
    }

    async _saveAIUsageReport(usage, model) {
        try {
            const db = await connectToMongo();
            usage.model = model;
            usage.date = new Date().toISOString();
            const pricing = this._calculatePrice(usage, model);
            if (pricing.price >= 11) {
                console.warn(`High AI Price: ${pricing.price}, PromptTokens: ${usage.prompt_tokens}, CompletionTokens: ${usage.completion_tokens}`)
            }

            usage.pricing = pricing;

            const result = await db.collection(collectionsEnum.AI_USAGE_REPORT).insertOne(usage);
            return result;
        } catch (err) {
            console.error('Error saving ai usage report:', err);
        }
    }

    _calculatePrice(usage, model) {
        const GPT4_PRICES = {
            input: 2.50 / 1_000_000,
            output: 10.00 / 1_000_000
        }

        const GPT4MINI_PRICES = {
            input: 0.15 / 1_000_000,
            output: 0.60 / 1_000_000
        }

        const GPT4_1_PRICES = {
            input: 2.00 / 1_000_000,
            output: 8.00 / 1_000_000
        }

        const GPT4_1_MINI_PRICES = {
            input: 0.40 / 1_000_000,
            output: 1.60 / 1_000_000
        }

        if (model == AIModels.GPT4) {
            const inputCost = usage.prompt_tokens * GPT4_PRICES.input;
            const outputCost = usage.completion_tokens * GPT4_PRICES.output;

            const totalCost = (inputCost + outputCost) * 100;
            return {
                price: parseFloat(totalCost.toFixed(3)),
                currency: "cents ($)"
            }
        } else if (model == AIModels.GPT4MINI) {
            const inputCost = usage.prompt_tokens * GPT4MINI_PRICES.input;
            const outputCost = usage.completion_tokens * GPT4MINI_PRICES.output;

            const totalCost = (inputCost + outputCost) * 100;
            return {
                price: parseFloat(totalCost.toFixed(3)),
                currency: "cents ($)"
            }
        }

        return -1;
    }
}

class AIService {
    constructor(aiHandler) {
        this.aiHandler = aiHandler;
    }

    async getCategorySelectors(pageContent, base64Image) {
        console.time("getCategorySelectors");
        const content = `
        ${pageContent}
        
        This is the homepage of an e-commerce website. I need CSS selectors to locate category, subcategory, and sub-subcategory elements.
        
        Please provide the CSS selectors to identify:
        - All main category elements (e.g., sections like "Shop by Category" or equivalent).
        - All category elements within each main category (if they exist).
        - All subcategory elements within each category (if they exist).
        - Promoted categories: (Check image)categories highlighted on the page, e.g., banners, or set to null if none.
        - Category Urls: A list of up to 3 category urls (Categories that contain products).
        
        IMPORTANT NOTES:
        - Check image and if there are promoted categories include all, not just 3. Otherwise set to null. 
        - Don't give main categories as promoted categories.
        - If elements are nested within different types of containers or wrappers, provide the most flexible selector that works across these variations.
        - Do NOT use the direct child selector (>), as the page structure may vary, so don't include '>' in response.
    
        Format the output as JSON, structured like this:
        {
            "mainCategorySelector": "CSS selector for categories",
            "categorySelector": "CSS selector for subcategories",
            "subCategorySelector": "CSS selector for sub-subcategories",
            "promotedCategories": [{"name": "Category1", "url": "/someUrl"}, ...],
            "categoryUrls": ["/de/category1", "/de/category2"]
        }
        `;

        const response = base64Image
            ? await this.aiHandler.askUsingImage(base64Image, content, AIModels.GPT4_1_MINI, 500)
            : await this.aiHandler.askUsingText(content, AIModels.GPT4_1_MINI, 500);

        console.timeEnd("getCategorySelectors");
        return await extractJsonObjectFromText(response);
    }

    async getProductUrls(pageContent, base64Image) {
        console.time("getProductUrls")
        const content = `
        ${pageContent}
        This is the product list(Category) of an e-commerce site. I want to find any product and go to its product page. 
    
        Find and return:
        - "productNames": A list of 1 product name.
        - "productNameSelector": DOM path for each product name, use [tag[class*='class']] format wherever possible
        - "productUrlSelector" DOM path for each product url
        - "productUrls": A list of 1 productUrl
    
        NOTE: 
        - Be careful to find urls of products NOT urls of categories, products usually have prices near them. 
        
        Guidelines:
        - List a maximum of 1 element for "productNames", "productNameSelector", "productUrlSelector" and "productUrls"
        - Provide output in this JSON format:
        {
            "productName": ["Iphone 14"],
            "productNameSelector": "a[class*='Some class']", 
            "productUrlSelector": "some selector",
            "productUrls": ["/collections/some-product-url"]
        }
        `;

        const response = base64Image
            ? await this.aiHandler.askUsingImage(base64Image, content, AIModels.GPT4MINI)
            : await this.aiHandler.askUsingText(content, AIModels.GPT4MINI);

        console.timeEnd("getProductUrls");
        return await extractJsonObjectFromText(response);
    }

    async isProductPage(base64Image) {
        console.time("isProductPage");

        const content = `
        This is the image of an e-commerce product page or product list.

        I am navigating through an e-commerce website, moving from the homepage to a product list page, and then to individual product pages.
        Look the provided image, assess the likelihood that the page in the image is:
        1. A product page
        2. A product list page 

        The combined probability of these two should add up to 100%. 

        Please respond in the following JSON format:
        {
            "isProductPage": [percentage likelihood],
            "isProductList": [percentage likelihood]
        }

        Example:
        {
            "isProductPage": 70,
            "isProductList": 30
        }
        `;

        const response = await this.aiHandler.askUsingImage(base64Image, content, AIModels.GPT4MINI);
        const result = await extractJsonObjectFromText(response);

        if (!result?.isProductPage) {
            return true;
        }

        console.timeEnd("isProductPage");
        return result?.isProductPage >= 50 || true;
    }

    async getProductMetadata(pageContent) {
        console.time("getProductMetadata")
        const content = `
            ${pageContent}
            This is the productPage html of an ecommerce site,
    
            Find the following DOM paths:
            - name, 
            - description
            - price,
            - discountPrice,
            - addToCartButton
            - rating (ex: 4/5)
            - reviewsCount 
            - category
           
            
            Hints: 
            - Name, Price and AddToCart button elements are usually near each other.
            - CartUrl is often /cart
    
            Key points:
            - Paths must be valid!
            - use someTag[class*='someclass'] instead of sometag.someclass wherever possible
            - Don't give comments on response!
    
            Give the response in this JSON format: ex:
            { 
                "name": "div h1[class*='Some class']",
                "description": "ex: div h1[class*='Some class']",  
                "price": "div p[class*='some class']", 
                "discountPrice": "div p[id='some id']", // null if doesn't exist
                "addToCartButton": "ex: div button[class*='Some class']", 
                "rating": "ex: div h1[class*='Some class']",
                "reviewsCount": "ex: div h1[class*='Some class']"
                "category": "some selector",
                "cartUrl": "ex: /de/cart(extension sometimes)",
            }
            `;

        const response = await this.aiHandler.askUsingText(content, AIModels.GPT4MINI);
        console.timeEnd("getProductMetadata");
        return await extractJsonObjectFromText(response);
    }

    async getProductInfo(pageContent, base64Image) {
        console.time("getProductInfo")
        const content = `
        ${pageContent}
        This is the product page of an e-commerce website and 
        I want to add this product to the cart using DOM paths. 
    
        If a size MUST be selected before adding to cart and there isn't any size selected by deflt, I should do these steps: 
            - open sizes dropdown(If any) 
            - select a size from the dropdown (that's in stock)
        Add the product to cart.
        
        Find DOM paths for the following product information:
        - name
        - price
        - discountPrice
        - availableSizesDropdown (an element like a select or button or ul that MUST be clicked)
        - sizeInStockOption (an option or li or other element representing a size within the dropdown or modal)
        - allSizes (each size option/element)
        - availableSizes(each size in stock element)
        - disabledAddToCartButton (disabled add to cart button - only if it exists for sure) 
        - addToCartButton (clickable element to add the product to the cart)
    
        Notes:
        1. Check image: If a size MUST be selected and there isn't any size selected, provide availableSizesDropdown and sizeInStockOption, otherwise set to null, 
        2. DO NOT include comments in the response, and if an item doesn't exist, set it to null.
        3. Be specific with the DOM paths and use someTag[class*='someclass'] instead of sometag.someclass wherever possible
    
        Return the response in this JSON format, for example:
        {
            "domPaths": { 
                "name": "div h1[class*='Some class']",
                "price": "div p[class*='some class']", 
                "discountPrice": "div p[id*='some id']", // null if doesn't exist
                "availableSizesDropdown": "div select[id*='some class']", // an element to click to reveal size options
                "sizeInStockOption": "div select option[value*='34']", // an individual size(In stock) option within the dropdown
                "allSizes": "div select[id*='some id']",
                "availableSizes": "some selector", 
                "disabledAddToCartButton": "some selector", // null if doesn't exist
                "addToCartButton": "div[class*='some-class']"
            }
        }
        `;

        const response = base64Image
            ? await this.aiHandler.askUsingImage(base64Image, content, AIModels.GPT4MINI)
            : await this.aiHandler.askUsingText(content, AIModels.GPT4MINI);

        console.timeEnd("getProductInfo")
        return await extractJsonObjectFromText(response);
    }

    async getMatchedCategories(list1, list2, minSimilarity = 70) {
        const content = `
        You are an assistant that compares two lists of categories and finds the matches between them.
        Given the following two lists of categories:
        List1: ${list1}
        List2: ${list2}
        Your task is to:
        1. Identify categories that are similar in meaning, even if written in different languages.
        2. Note: The returned category_from_list1 category MUST be in the List1 and the category_from_list2 MUST be in the List2

        Return the result in the following JSON format:
        {
            "matches": [
                { "list1": "category_from_list1", "list2": "category_from_list2", "percentage": matchPercentage },
                ...
            ]
        }
        `;

        const response = await this.aiHandler.askUsingText(content, AIModels.GPT4MINI);
        let matches = (await extractJsonObjectFromText(response)).matches;
        matches = matches.filter(m =>
            list1.some(item => item.toLowerCase() === m.list1.toLowerCase()) &&
            m.percentage >= minSimilarity
        );

        return matches || [];
    }

    async getPromotion(html, base64Image) {
        const prompt = `
            =========  BEGIN HTML  =========
            ${html}
            =========  END HTML    =========

            TASK
            ----
            From the HTML above and the image provided, decide whether the page is running a promotion and, if so, estimate how strong it is.

            • **Promotion cues (non-exhaustive):**
             Price badges such as “-20 %”, “-€5”, “Sale”, “Rabatt”, “Deal”, “Promo”, “Flash Sale”, “Clearance”, “Outlet”  
             A struck-through (original) price shown next to a lower price  
             Phrases containing “discount”, “save”, “special offer”, “limited time”, “2 for 1”, “bundle”, “coupon”, “voucher”, “Black Friday”, “Cyber Monday”  
             Percentages ≥ 10 % next to a price  
             Countdown timers or banners indicating urgency (e.g., “Ends in 03:59:12”)  
             Badges or ribbons with distinct sale colors ( red / orange )

            • **Compute promotionRate** (integer 1-100) by combining:
             Density of promotion cues vs. total product/price elements  
             Magnitude of discounts (bigger % → higher score)  
             Visual emphasis (banners, hero sliders, pop-ups raise the score)

            • **Set hasPromotion** to true only when promotionRate > 50, otherwise false.

            OUTPUT
            ------
            Return **only** valid JSON:

            {
            "hasPromotion": true|false,
            "promotionRate": 1-100,
            }

            Do not output anything else.
        `
        const aiResponse = await this.aiHandler.askUsingImage(base64Image, prompt, AIModels.GPT4MINI)
        return await extractJsonObjectFromText(aiResponse);
    }
}

const aiService = new AIService(new AIHandler(process.env.OPENAI_API_KEY));

export { aiService, AIHandler };

