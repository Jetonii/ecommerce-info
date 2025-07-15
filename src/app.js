import { createAdapter } from '@socket.io/redis-adapter';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { connectToRedis, pubClient, shutdownRedis, subClient } from "./modules/redis/redisClient.js";
import socketHandlers from './modules/socketHandlers/socketHandlers.js';
import apiRoutes from '../routes/api.js';
import competitorRoutes from "../routes/competitorsApi.js";
import urlProcessor from './scraper/urlProcessor.js';

dotenv.config();

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

io.on('connection', (socket) => {
    socketHandlers(socket);
});

// Listen to bull queues
await urlProcessor.processDownloadedProductListUrls();
await urlProcessor.processDownloadedProductPageUrls();

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

process.on('SIGINT', async () => {
    await shutdownRedis();
    process.exit(0);
});