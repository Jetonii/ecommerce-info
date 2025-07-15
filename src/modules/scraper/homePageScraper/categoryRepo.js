import { connectToClickHouse } from "../../../common/db/db.js";

class CategoryRepo {
    constructor() {
        this.clickHouseDb = null;
        this.tableName = `aiScraper.target_category_urls`;
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

    async getCategoriesByTarget(target, limit = 1000) {
        try {
            const query = `
                SELECT name, url
                FROM ${this.tableName}
                WHERE target = '${target}'
                LIMIT ${limit}
            `;

            const result = await this.clickHouseDb.query({ query: query });
            return (await result.json())?.data;
        } catch (error) {
            console.error("Error retrieving data by target:", error);
            return null;
        }
    }

    async getCategoryUrlsByTarget(target) {
        try {
            const query = `
                SELECT url
                FROM ${this.tableName}
                WHERE target = '${target}'    
            `;

            const result = await this.clickHouseDb.query({
                query: query,
                params: [target],
            });

            return (await result.json())?.data?.map(row => row.url);
        } catch (error) {
            console.error("Error retrieving URLs by target:", error);
            return null;
        }
    }

    _buildInsertData(target, data) {
        const finalData = Array.isArray(data) ? data : [data];

        return finalData.map((item) => {
            return {
                url: item.url,
                target: target,
                name: item.name
            };
        });
    }
}

const categoryRepo = new CategoryRepo();
await categoryRepo.init();  
export default categoryRepo;