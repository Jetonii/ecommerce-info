import { createClient } from 'redis';
import "dotenv/config"

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

const connectToRedis = async () => {
    try {
        await Promise.all([pubClient.connect(), subClient.connect()]);
        console.log('Connected to Redis');
    } catch (error) {
        console.error('Failed to connect to Redis:', error);
    }
};

const shutdownRedis = async () => {
    try {
        await pubClient.quit();
        await subClient.quit();
    } catch (error) {
        console.error('Error shutting down Redis:', error);
    }
};

export { pubClient, subClient, connectToRedis, shutdownRedis };
