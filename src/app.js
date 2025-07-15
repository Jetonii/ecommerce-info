import { createAdapter } from '@socket.io/redis-adapter';
import bodyParser from 'body-parser';
import cors from 'cors';
import "dotenv/config";
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import apiRoutes from '../routes/api.js';
import competitorRoutes from "../routes/competitorsApi.js";
import { connectToRedis, pubClient, subClient } from "./modules/redis/redisClient.js";
import urlProcessor from './modules/scraper/urlProcessor.js';
import { connectToMongo } from './common/db/db.js';
import { createMongoIndexes } from './common/db/indexes.js';


const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(bodyParser.json({ limit: "50mb" }));
app.use(cors());

await connectToRedis();

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

io.adapter(createAdapter(pubClient, subClient));

app.use("/api", apiRoutes);
app.use("/api/competitors", competitorRoutes);

await connectToMongo();
await createMongoIndexes();

// Listen to bull queues
await urlProcessor.processDownloadedProductListUrls();
await urlProcessor.processDownloadedProductPageUrls();

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
