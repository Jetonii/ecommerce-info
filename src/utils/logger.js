import { infoSeverity } from "../config/constants.js";
import { connectToMongo } from "../modules/db/db.js";

export async function logErrors(err) {
    try {
        const error = {
            date: new Date(),
            stack: err.stack,
            message: "CompetitorScraper:" + err.message,
            // errorLevel: 'CompetitorScraper',
            type: "Error"
        };

        const db = await connectToMongo();
        await db.collection('competitorScraperLogs').insertOne(error);
    } catch (error) {
        console.error("Failed to log error:", error);
    }
};

export async function logInfo(message, severity = infoSeverity.INFO) {
    try {
        const timestamp = new Date().toISOString().split('.')[0];
        console.log(`[${timestamp}] ${message}`);
        const logEntry = {
            createdAt: new Date(),
            message: message,
            severity,
            type: "Info"
        };

        const db = await connectToMongo();
        await db.collection('competitorScraperLogs').insertOne(logEntry);
    } catch (error) {
        console.error("Failed to log info:", error);
    }
}

export async function logTargetInfo(target, message, severity = infoSeverity.INFO) {
    try {
        const timestamp = new Date().toISOString().split('.')[0];
        console.log(`[${timestamp}] [${target}] ${message}`);
        const logEntry = {
            createdAt: new Date(),
            message: message,
            target,
            severity,
            type: "Info"
        };

        const db = await connectToMongo();
        await db.collection('competitorScraperLogs').insertOne(logEntry);
    } catch (error) {
        console.error("Failed to log info:", error);
    }
}