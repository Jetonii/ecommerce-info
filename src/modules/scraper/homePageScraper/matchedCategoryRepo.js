import { connectToClickHouse } from "../../../common/db/db.js";

class MatchedCategoryRepo {
    constructor() {
        this.clickHouseDb = null;
        this.tableName = `aiScraper.target_competitor_category_mappings`;
    }

    async init() {
        this.clickHouseDb = await connectToClickHouse();
        await this.createTable();
    }

    async createTable() {
        try {
            const query = `
                CREATE TABLE IF NOT EXISTS ${this.tableName} (
                    target String,
                    competitor String,
                    targetCategory String,
                    competitorCategory String,
                    createdAt DateTime64(3) DEFAULT now64(3)
                ) ENGINE = MergeTree()
                ORDER BY (target, targetCategory)
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

    async getTargetCategories(target) {
        try {
            if (!target) return [];

            const tableName = `merch_visits_${target}`;

            const query = `
                SELECT DISTINCT category
                FROM aiScraper.${tableName} 
                WHERE category != '' AND category IS NOT NULL
                ORDER BY category ASC;
            `;

            const queryResult = await this.clickHouseDb.query({
                query,
                format: 'JSONEachRow',
            });

            const categories = (await queryResult.json())?.map((row) => row.category) || [];

            return categories;
        } catch (error) {
            console.log("Error fetching competitor data", error);
            return [];
        }
    }

    async getAlreadyMatchedCategories(target, competitor) {
        try {
            if (!target || !competitor) {
                console.log("Target and competitor must be given!");
                return [];
            }

            const query = `
                SELECT DISTINCT targetCategory as category
                FROM ${this.tableName}
                WHERE target = '${target}' AND competitor = '${competitor}'
            `;

            const queryResult = await this.clickHouseDb.query({
                query,
                format: 'JSONEachRow',
            });

            const categories = (await queryResult.json())?.map((row) => row.category) || [];
            return categories;
        } catch (error) {
            console.log(`Error getting already matched categories! Target: ${target} Competitor: ${competitor}`, error);
            return [];
        }
    }

    _buildInsertData(target, data) {
        const finalData = Array.isArray(data) ? data : [data];

        return finalData.map((item) => {
            return {
                target: target,
                competitor: item.competitor,
                targetCategory: item.targetCategory, 
                competitorCategory: item.competitorCategory
            };
        });
    }
}

const matchedCategoryRepo = new MatchedCategoryRepo();
await matchedCategoryRepo.init();
export default matchedCategoryRepo;