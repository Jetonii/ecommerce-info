import moment from "moment";
import { connectToClickHouse } from "../../../common/db/db.js";
import { logTargetInfo } from "../../../common/utils/logger.js";

class ProductDetailsRepo {
    constructor() {
        this.clickHouseDb = null;
        this.tableName = `aiScraper.target_product_details`;
    }

    async init() {
        this.clickHouseDb = await connectToClickHouse();
        await this.createTable();
    }

    async createTable() {
        try {
            const query = `
                CREATE TABLE IF NOT EXISTS ${this.tableName} (
                    url String,
                    target String,
                    name Nullable(String),
                    formerPrice Float32,    
                    price Float32,
                    currency Nullable(String),
                    all_sizes Array(String),
                    available_sizes Array(String),
                    available Bool,
                    reviews Nullable(Int64),
                    rating Nullable(Float32),
                    category String,
                    description Nullable(String),
                    createdAt DateTime64(3) DEFAULT now64(3)
                ) ENGINE = MergeTree()
                ORDER BY (target, url)
            `;

            await this.clickHouseDb.query({ query });
            return true;
        } catch (error) {
            console.error("Error creating table:", error);
            return false;
        }
    }

    async create(target, data) {
        try {
            const insertData = this._buildInsertData(target, data);

            await this.clickHouseDb.insert({
                table: this.tableName,
                values: insertData,
                format: 'JSONEachRow',
            });

            return true;
        } catch (error) {
            console.error("Error inserting data:", error);
            return false;
        }
    }

    _buildInsertData(target, data) {
        const finalData = Array.isArray(data) ? data : [data];
        if (!finalData || finalData.length === 0) {
            return;
        }

        return finalData.map((item) => ({
            url: item.url,
            target,
            name: item.name,
            formerPrice: item.formerPrice,
            price: item.price,
            currency: item.currency || null,
            all_sizes: Array.isArray(item.all_sizes) ? item.all_sizes : [],
            available_sizes: Array.isArray(item.available_sizes) ? item.available_sizes : [],
            available: item.available,
            reviews: item.reviews,
            rating: item.rating,
            category: item.category,
            description: item.description,
            // createdAt: item.createdAt
        }));
    }

    async detectAndInsertChanges(target, newScrapeData, scrapeDate) {
        try {
            const changeableProperties = ['name', 'formerPrice', 'price', 'rating', 'reviews'];
            const lastScrapeQuery = `
                SELECT DISTINCT ON (url)
                    url,
                    ${changeableProperties.join(', ')},
                    createdAt
                FROM ${this.tableName}
                WHERE target = '${target}'
                ORDER BY url, createdAt DESC;
            `;

            const lastScrapeResponse = await this.clickHouseDb.query({ query: lastScrapeQuery, format: 'JSON' });
            const lastScrapeData = (await lastScrapeResponse.json()).data || [];

            const lastScrapeMap = new Map(lastScrapeData.map((item) => [item.url, item]));

            const productsToCreate = [];
            for (const newRow of newScrapeData) {
                const lastRow = lastScrapeMap.get(newRow.url);

                if (lastRow) {
                    let hasChanges = false;
                    for (const property of changeableProperties) {
                        const oldValue = lastRow[property];
                        const newValue = newRow[property];

                        if (newValue && newValue != oldValue) {
                            await logTargetInfo(target, `${property}, ${oldValue} → ${newValue}`);
                            hasChanges = true;
                        }
                    }

                    if (hasChanges) {
                        const newProduct = {
                            url: newRow.url,
                            target,
                            createdAt: scrapeDate,
                            ...newRow,
                        };

                        productsToCreate.push(newProduct);
                    }
                } else {
                    const newProduct = {
                        url: newRow.url,
                        target,
                        createdAt: scrapeDate,
                        ...newRow,
                    };

                    productsToCreate.push(newProduct);
                }
            }

            await logTargetInfo(target, `Detected product details changes: ${productsToCreate.length}`);

            if (productsToCreate.length > 0) {
                await this.create(target, productsToCreate);
            } else {
                // console.log('No changes to insert.');
            }
        } catch (error) {
            console.log(`Error while detecting changes! Message: ${error.message}`);
        }
    }

    async getAggregatedFactors(query) {
        const { startDate: startDateFormatted, endDate: endDateFormatted } = this._constructDates(query);

        const result = await this.getCompetitorOverview(
            {
                startDateFormatted,
                endDateFormatted,
                ...query
            });

        return result;
    }

    async getCompetitorOverview(params) {
        try {
            let { startDateFormatted, endDateFormatted, competitor, selectedTarget } = params;

            if (!competitor) {
                const competitors = await this.getCompetitors();
                if (competitors?.length > 0) {
                    competitor = competitors[0]?.target;
                }
            }

            const query = `
                SELECT 
                    ROUND(AVG(IF(formerPrice > 0, (formerPrice - price) / formerPrice * 100, 0)), 2) AS avgDiscount,
                    ROUND(AVG(price), 2) AS avgPrice,
                    COUNT(*) AS totalListedProducts,
                    COUNT(IF(createdAt BETWEEN '${startDateFormatted}' AND '${endDateFormatted}', 1, NULL)) AS totalNewProducts,
                    COUNT(IF(url NOT IN (
                        SELECT DISTINCT url 
                        FROM ${this.tableName}
                        WHERE target = '${competitor}'
                    ), 1, NULL)) AS totalRemovedProducts
                FROM (
                    SELECT 
                        url,
                        anyLast(formerPrice) AS formerPrice,
                        anyLast(price) AS price,
                        anyLast(createdAt) AS createdAt
                    FROM ${this.tableName}
                    WHERE target = '${competitor}'
                    GROUP BY url
                ) AS latest;
            `;

            const result = await this.clickHouseDb.query({ query });
            const data = (await result.json())?.data || [];

            console.log("Data: ", data);

            const competitorMetrics = this._formatMetrics(data[0]);

            const you = await this.getTargetOverview(params, selectedTarget);
            return { competitor: competitorMetrics, you };
        } catch (error) {
            console.log("Error fetching competitor overview:", error.message);
        }
    }

    async getCompetitors(params) {
        // Todo: Get the real competitors dynamically
        const competitors = [
            { name: 'Nikin', target: 'nikin.ch' },
            { name: 'Boerlind', target: 'boerlind.com' },
            { name: 'Atalanda', target: 'atalanda.com' },
        ];

        return competitors;
    }

    async getTargetOverview(params, selectedTarget) {
        try {
            const { startDateFormatted, endDateFormatted } = params;

            const query = `
                SELECT
                    ROUND(AVG(formerPrice), 2) AS avgPrice, 
                    ROUND((COUNTIf(discountPrice IS NOT NULL AND discountPrice != formerPrice) / COUNT(*)) * 100, 2) AS avgDiscount, 
                    COUNT(*) AS totalListedProducts,
                    ROUND(IF(COUNTIf(rating != 0) = 0, 0, AVGIf(rating, rating != 0)), 2) AS avgRating, 
                    COUNTIf(productID NOT IN (
                        SELECT productID 
                        FROM ${"aiScraper.merch_visits_siggde"}
                        WHERE date < '${startDateFormatted}' 
                    ) AND date BETWEEN '${startDateFormatted}' AND '${endDateFormatted}') AS totalNewProducts 
                FROM (
                    SELECT 
                        productID,
                        anyLast(formerPrice) AS formerPrice, 
                        anyLast(price) AS discountPrice,
                        anyLast(rating) AS rating, 
                        anyLast(date) AS date
                    FROM ${"aiScraper.merch_visits_siggde"}
                    GROUP BY productID
                )
            `;

            const queryResult = await this.clickHouseDb.query({ query });
            const data = (await queryResult.json())?.data || [];

            return this._formatMetrics(data[0]);
        } catch (error) {
            console.log("Error fetching target overview:", error.message);
        }
    }

    _formatMetrics(metrics = {}) {
        return {
            avgPrice: metrics.avgPrice || 0,
            avgDiscount: metrics.avgDiscount || 0,
            avgAvailability: 20, // Static for now
            avgRating: metrics.avgRating || 0,
            totalListedProducts: parseInt(metrics.totalListedProducts || 0, 10),
            totalNewProducts: parseInt(metrics.totalNewProducts || 0, 10),
            totalRemovedProducts: metrics.totalRemovedProducts ? parseInt(metrics.totalRemovedProducts, 10) : 0,
            totalCategories: 43,
            totalSubCategories: 74,
            promotion: null
        };
    }

    _defaultMetrics() {
        return {
            avgPrice: 0,
            avgDiscount: 0,
            avgAvailability: 0,
            avgRating: 0,
            totalListedProducts: 0,
            totalNewProducts: 0,
            totalRemovedProducts: 0,
            totalCategories: 0,
            totalSubCategories: 0,
            promotedCategories: [],
            promotion: null
        };
    }

    _constructDates(query) {
        const timezone = query.startDate.split('@')[1] || null;

        const startDate = moment.utc(query.startDate.split('@')[0] || moment.utc().startOf('day')).format('YYYY-MM-DD HH:mm:ss');
        const endDate = moment.utc(query.endDate.split('@')[0] || moment.utc()).format('YYYY-MM-DD HH:mm:ss');

        return { startDate, endDate, timezone };
    }
}

const productDetailsRepo = new ProductDetailsRepo();
await productDetailsRepo.init();
export default productDetailsRepo;  