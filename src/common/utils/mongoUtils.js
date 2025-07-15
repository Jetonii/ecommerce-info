import { ObjectId } from "mongodb";
import { getMongoCollection } from "../../modules/db/db.js";
import { collectionsEnum } from "../constants/constants.js";
import prettyLog from "./prettyLog.js";

class MongoIdHelper {
  static toObjectId(id) {
    if (!id) throw new Error("ID is required");

    if (id instanceof ObjectId) return id;

    if (typeof id !== "string" || !ObjectId.isValid(id)) {
      throw new Error(`Invalid MongoDB ObjectId format: ${id}`);
    }

    return new ObjectId(id);
  }

  static toObjectIds(ids) {
    if (!Array.isArray(ids)) throw new Error("IDs must be an array");
    return ids.map((id) => this.toObjectId(id));
  }
}

export default MongoIdHelper;

export const getLatestDoc = async (
  collectionName,
  filter = {},
  sortBy = "_id",
  projection = {}
) => {
  const collection = await getMongoCollection(collectionName);

  const [latest] = await collection
    .find(filter, { projection })
    .sort({ [sortBy]: -1 }) // descending
    .limit(1)
    .toArray();

  return latest || null;
};

export const getById = async (collectionName, id) => {
  const collection = await getMongoCollection(collectionName);

  return await collection.findOne({ _id: MongoIdHelper.toObjectId(id) });
};

export const getAllDocuments = async (collectionName, filter = {}) => {
  const collection = await getMongoCollection(collectionName);

  return await collection.find(filter).toArray();
};

export const insertDocument = async (collectionName, doc) => {
  const collection = await getMongoCollection(collectionName);

  const result = await collection.insertOne(doc);
  return result.insertedId;
};

export const updateById = async (collectionName, id, update, { upsert = false } = {}) => {
    const collection = await getMongoCollection(collectionName);

    return await collection.updateOne({ _id: MongoIdHelper.toObjectId(id) }, update, { upsert });
};


