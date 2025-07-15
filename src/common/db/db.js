import { createClient } from '@clickhouse/client';
import "dotenv/config";
import { MongoClient } from "mongodb";

let mongoDb = null;
let mongoDbPromise = null;
export async function connectToMongo() {
  if (mongoDb) return mongoDb; 

  if (mongoDbPromise) return await mongoDbPromise; // Wait for ongoing connections

  mongoDbPromise = (async () => {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    const dbName = process.env.MONGO_DB_NAME;
    if (!dbName){
        throw new Error("MongoDb name must be provided through .env file!")
    }
    
    mongoDb = client.db(dbName);
    console.log("Connected to MongoDB");
    return mongoDb;
  })();

  return await mongoDbPromise;
}


export async function getMongoCollection(name) {
  const db = await connectToMongo();
  return db.collection(name);
}


let clickHouseDb;

export const connectToClickHouse = async () => {
  if (clickHouseDb) return clickHouseDb;

  clickHouseDb = new createClient({
    url: process.env.CLICKHOUSE_URL,
    username: 'default',
    password: '',
    database: process.env.CLICKHOUSE_DB_NAME,
  });

  clickHouseDb.ping()
    .then(() => console.log('Connected to ClickHouse'))
    .catch((error) => console.error('Connection failed:', error));
  return clickHouseDb;
};


await connectToMongo(); 
await connectToClickHouse();