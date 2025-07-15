import { connectToMongo } from "./db.js";
import { collectionsEnum } from "../config/constants.js";

export const createMongoIndexes = async () => {
    const db = await connectToMongo();

    const targetsInfo = db.collection(collectionsEnum.TARGETS_INFO);
    console.log("Mongo indexes created successfully.");
};
