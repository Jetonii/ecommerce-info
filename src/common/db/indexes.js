import { connectToMongo } from "./db.js";
import { collectionsEnum } from "../config/constants.js";

export const createMongoIndexes = async () => {
    const db = await connectToMongo();

    const awsEc2PricesCollection = db.collection(collectionsEnum.AWS_EC2_PRICES);

    await awsEc2PricesCollection.createIndex({ regionCode: 1 });
    await awsEc2PricesCollection.createIndex({ operatingSystem: 1 });

    console.log("Mongo indexes created successfully.");
};
