import { connectToClickHouse } from "../../../common/db/db.js";

class ProductUrlRepo {
    constructor() {
        this.clickHouseDb = null;
        this.tableName = `aiScraper.target_product_urls`;
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
                    position Nullable(Int32),
                    category String,
                    name String,
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

        return finalData.map((item) => {
            return {
                url: item.url,
                target: target,
                position: item.position,
                name: item.name,
                category: item.category
            };
        });
    }

    async getProductUrlsByTarget(target) {
        try {
            const query = `
                SELECT url, category
                FROM ${this.tableName}
                WHERE target = '${target}'    
            `;

            const result = await this.clickHouseDb.query({
                query: query,
                params: [target],
            });

            return (await result.json())?.data;
        } catch (error) {
            console.error("Error retrieving URLs by target:", error);
            return null;
        }
    }
}

const productUrlRepo = new ProductUrlRepo();
await productUrlRepo.init();
export default productUrlRepo;
