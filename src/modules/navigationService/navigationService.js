const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export default class NavigationService {
    constructor(page) {
        this.page = page;
    }

    async navigateToCart(productInfoJson) {
        try {
            if (productInfoJson?.domPaths) {
                const {
                    availableSizesDropdown,
                    sizeInStockOption,
                    addToCartButton,
                    cartPath
                } = productInfoJson.domPaths;

                if (availableSizesDropdown) {
                    await this.#clickFirstAndLastElement(availableSizesDropdown, "availableSizesDropdown");
                }

                if (sizeInStockOption) {
                    await this.#clickAndSelectElement(sizeInStockOption, "sizeInStockOption");
                } else {
                    console.log("The 'sizeInStockOption' isn't defined!");
                }

                if (addToCartButton) {
                    await this.#clickFirstElement(addToCartButton, "addToCartButton");
                    await delay(2000);
                } else {
                    console.log("The 'addToCartButton' isn't defined!");
                }

                if (cartPath) {
                    const cartUrl = new URL(cartPath, this.page.url()).href;

                    await this.page.goto(cartUrl, { waitUntil: 'networkidle2' });
                    console.log(`Navigated to cart url: ${cartUrl}`);
                    return cartUrl;
                } else {
                    console.log("The cart path isn't defined!");
                }
            }
        } catch (err) {
            console.log("Error navigating to cart:", err);
        }
    }

    async navigateToProductList(categoryUrl) {
        try {
            const productListUrl = new URL(categoryUrl, this.page.url()).href;
            await this.page.goto(productListUrl, { waitUntil: 'networkidle2' });
            console.log(`Navigated to product list: ${productListUrl}`);
            return productListUrl;
        } catch (err) {
            console.log(`Error navigating to product list: ${categoryUrl}`, err);
        }
    }

    async navigateToProductPage(productLink) {
        try {
            const productPageUrl = new URL(productLink, this.page.url()).href;
            await this.page.goto(productPageUrl, { waitUntil: 'networkidle2' });
            console.log(`Navigated to product page: ${productPageUrl}`);
            
            return productPageUrl;
        } catch (err) {
            console.log("Error navigating to product page: ", err);
        }
    }

    // Private methods
    async #clickFirstElement(selector, elementName) {
        try {
            const element = await this.page.waitForSelector(selector, { visible: false, timeout: 2000 });
            if (element) {
                await element.evaluate(e => e.click());
                console.log(`Clicked first ${elementName}!`);
            }
            await delay(1000);
        } catch (err) {
            console.log(`Couldn't find ${elementName} by selector: '${selector}'!`);
        }
    }

    async #clickFirstAndLastElement(selector, elementName) {
        try {
            const elements = await this.page.$$(selector);
            if (elements.length > 0) {
                await elements[0].evaluate(e => e.click());
                if (elements.length > 1) {
                    await elements[elements.length - 1].evaluate(e => e.click());
                }

                await delay(1000);
                console.log(`Clicked first and last ${elementName}!`);
            } else {
                // console.log(`No ${elementName} found by selector: '${selector}'!`);
            }
        } catch (err) {
            console.log(`Error clicking ${elementName}:`, err);
        }
    }

    async #clickAndSelectElement(selector, elementName) {
        try {
            let baseSelector = null;
            let containsValue = null;
            if (selector.indexOf(":contains") >= 0) {
                const splitted = selector.split(":contains");
                baseSelector = splitted[0];
                containsValue = splitted[1].replace(/[()']/g, '').trim();
            }

            let element = await this.page.waitForSelector(baseSelector || selector, { visible: false, timeout: 2000 });
            if (element && containsValue) {
                const elements = await this.page.$$(baseSelector);
                for (let el of elements) {
                    const text = await el.evaluate(node => node.textContent.trim());
                    if (text.includes(containsValue)) {
                        element = el;
                        break;
                    }
                }
            }

            if (element) {
                await element.evaluate(e => e.click());
                await this.#selectOptionDirectly(element);
                console.log(`Clicked and selected option ${elementName}!`);
            }

            await delay(1000);
        } catch (err) {
            console.log(`Couldn't find ${elementName} by selector: '${selector}'!`);
        }
    }

    async #selectOptionDirectly(option) {
        await this.page.evaluate((option) => {
            if (option) {
                option.selected = true;
                option.parentElement.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, option);
    }
}
