import moment from "moment";
import { collectionsEnum, scrapeStatus } from "../../common/config/constants.js";
import { logErrors } from "../../common/utils/logger.js";
import { getFullUrl, isValidUrl } from "../../common/utils/urlUtils.js";
import Scraper from "../scraper/scraper.js";
import { connectToMongo } from "../../common/db/db.js";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class ScrapeScheduler {
    constructor() {
    }

    async run() {
        try {
            // 1. Connect to DB and fetch all competitors
            const db = await connectToMongo();
            const collection = db.collection(collectionsEnum.COMPETITOR_SCRAPE_SCHEDULE);
            const competitors = await collection.find({ isActive: true }).toArray();

            console.log("Active competitors to scrape length: ", competitors.length); 

            // 2. Loop through all competitors
            for (const competitor of competitors) {
                if (competitor.status === scrapeStatus.RUNNING) {
                    console.log(`Competitor ${competitor.competitorUrl} is still running! ${new Date().toISOString()}`);
                }

                if (this._shouldScrapeToday(competitor)) {
                    console.log(`Scraping competitor ${competitor.competitorUrl}...`);

                    const lastScrapedAt = new Date().toISOString();

                    // 3. Update status to RUNNING
                    await this.updateCompetitorScrapeStatus(competitor.competitorUrl, scrapeStatus.RUNNING, lastScrapedAt);

                    try {
                        const scraper = new Scraper(competitor.competitorUrl);
                        await scraper.scrape(competitor.target);
                    } catch (error) {
                        console.error(`Error scraping competitor ${competitor.competitorUrl}:`, error);
                        await logErrors(error);
                    }
                } else {
                    console.log(`Skipping competitor ${competitor.competitorUrl}: not scheduled for today.`);
                }
            }
        } catch (error) {
            console.error("Error running daily scrape job:", error);
            await logErrors(error);
        }
    }

    async runCompetitor(competitorUrl) {
        try {
            const db = await connectToMongo();
            const collection = db.collection(collectionsEnum.COMPETITOR_SCRAPE_SCHEDULE);

            const competitor = await collection.findOne({ competitorUrl, isActive: true });
            if (!competitor) {
                console.log(`Competitor ${competitorUrl} doesn't exist!`);
                return;
            }

            // if (competitor.status === scrapeStatus.RUNNING) {
            //     console.log(`Skipping competitor ${competitorUrl} as it's already running! ${new Date().toISOString()}`);
            //     return;
            // }

            console.log(`Started scraping competitor: ${competitorUrl}`);

            const lastScrapedAt = new Date().toISOString();

            // Update status to RUNNING
            await this.updateCompetitorScrapeStatus(competitor.competitorUrl, scrapeStatus.RUNNING, lastScrapedAt);

            const scraper = new Scraper(competitor.competitorUrl);
            await scraper.scrape(competitor.target);
        } catch (error) {
            console.log(`Error happened while running competitor: ${competitorUrl}!`, error.message);
            await logErrors(error)
        }
    }

    async searchCompetitors(target, scrapeFrequency, page, pageSize) {
        try {
            const db = await connectToMongo();
            const collection = db.collection(collectionsEnum.COMPETITOR_SCRAPE_SCHEDULE);

            const { skip, limit } = this._constructPagination({ page, pageSize });
            let competitors = await collection
                .find({
                    target: { $regex: target, $options: 'i' },
                    ...(scrapeFrequency && { scrapeFrequency }),
                })
                .sort({ competitorName: 1 })
                .skip(skip)
                .limit(limit || 0) // 0 for no limit 
                .toArray();

            const status = competitors?.length && competitors.every(c => c.status === scrapeStatus.RUNNING)
                ? scrapeStatus.RUNNING
                : scrapeStatus.NOT_RUNNING;

            const isActive = competitors?.length && competitors.every(c => c.isActive);
            return { success: true, competitors, status, isActive }
        } catch (error) {
            console.log("Error fetching competitors:", error);
            return { success: false, message: "Something wrong happened!" };
        }
    };

    async addCompetitor(target, competitorName, competitorUrl, scrapeFrequency) {
        try {
            if (!target || !competitorName || !competitorUrl || !scrapeFrequency) {
                return { success: false, message: `Missing required field(s): target, competitorName, competitorUrl, scrapeFrequency` };
            }

            if (!isValidUrl(competitorUrl)) {
                return { success: false, message: `The competitor url is invalid! Url: ${competitorUrl} ` }
            }

            if (!this._isValidScrapeFrequency(scrapeFrequency)) {
                return { success: false, message: `The scrape frequency is invalid! Frequency: ${scrapeFrequency}` }
            }

            const db = await connectToMongo();
            const collection = db.collection(collectionsEnum.COMPETITOR_SCRAPE_SCHEDULE);

            const existing = await collection.findOne({ competitorUrl });
            if (existing) {
                const targets = this._getTargets(existing);

                if (!targets.includes(target)) {
                    const updatedTargets = existing.target + `, ${target}`;
                    await this.updateCompetitor(updatedTargets, null, competitorUrl, "Daily");
                    return { success: true, message: `Competitor ${competitorUrl} added successfully!` };
                }

                const isSingleTarget = targets.length === 1;
                if (!isSingleTarget || existing.scrapeFrequency === scrapeFrequency) {
                    return { success: false, message: `Competitor ${competitorUrl} already exists!` };
                }

                // If the only target update scrapeFrequency, else scrape Daily
                const updatedFrequency = isSingleTarget ? scrapeFrequency : "Daily";
                return await this.updateCompetitor(null, competitorName, competitorUrl, updatedFrequency);
            }

            const newCompetitor = {
                target,
                competitorName,
                competitorUrl,
                scrapeFrequency,
                status: scrapeStatus.NOT_RUNNING,
                createdAt: new Date().toISOString(),
                isActive: true
            };

            await collection.insertOne(newCompetitor);
            return { success: true, message: "Competitor added successfully." };
        } catch (error) {
            console.error("Error creating competitor:", error);
            await logErrors(error);
            return { success: false, message: "Error creating competitor." };
        }
    }

    async updateCompetitor(target, competitorName, competitorUrl, scrapeFrequency) {
        try {
            if (!scrapeFrequency) {
                return { success: false, message: `Missing scrapeFrequency! ` }
            }

            if (!isValidUrl(competitorUrl)) {
                return { success: false, message: `The competitor url is invalid! Url: ${competitorUrl} ` }
            }

            if (!this._isValidScrapeFrequency(scrapeFrequency)) {
                return { success: false, message: `The scrape frequency is invalid! Frequency: ${scrapeFrequency}` }
            }

            const db = await connectToMongo();
            const collection = db.collection(collectionsEnum.COMPETITOR_SCRAPE_SCHEDULE);

            const competitor = await collection.findOne({ competitorUrl });
            if (!competitor) {
                return { success: false, message: "Competitor not found." };
            }

            const targets = this._getTargets(competitor);
            if (targets.length > 1) {
                scrapeFrequency = "Daily";
            }

            // Update in DB
            await collection.updateOne(
                { competitorUrl },
                {
                    $set: {
                        ...(target && { target }),
                        ...(competitorName && { competitorName }),
                        ...(scrapeFrequency && { scrapeFrequency }),
                        updatedAt: new Date().toISOString(),
                    },
                }
            );

            return { success: true, message: "Competitor updated successfully." };
        } catch (error) {
            console.error("Error updating competitor:", error);
            await logErrors(error);
            return { success: false, message: "Something went wrong." };
        }
    }

    async deleteCompetitor(target, competitorUrl) {
        try {
            const db = await connectToMongo();
            const collection = db.collection(collectionsEnum.COMPETITOR_SCRAPE_SCHEDULE);

            const existing = await collection.findOne({ competitorUrl });

            const targets = this._getTargets(existing);
            if (!existing || !targets.includes(target)) {
                return { success: false, message: `${competitorUrl} not found.` };
            }

            if (targets.length === 1) {
                // if the only target, delete the competitor
                await collection.deleteOne({ competitorUrl });
            } else {
                // remove the target from the document
                const updatedTargetString = targets.filter(t => t !== target).join(', ');
                await this.updateCompetitor(updatedTargetString, null, competitorUrl, existing.scrapeFrequency);
            }

            return { success: true, message: `Removed competitor: ${competitorUrl}` };
        } catch (error) {
            console.error("Error removing competitor:", error);
            await logErrors(error);
            return { success: false, message: "Something went wrong." };
        }
    }

    async updateCompetitorActiveStatus(target, scrapeFrequency, isActive) {
        try {
            if (!this._isValidScrapeFrequency(scrapeFrequency)) {
                return { success: false, message: `The scrape frequency is invalid! Frequency: ${scrapeFrequency}` };
            }

            const db = await connectToMongo();
            const collection = db.collection(collectionsEnum.COMPETITOR_SCRAPE_SCHEDULE);

            const result = await collection.updateMany(
                {
                    target: { $regex: target, $options: 'i' },
                    scrapeFrequency
                },
                {
                    $set: {
                        isActive,
                        updatedAt: new Date().toISOString()
                    }
                }
            );

            if (result?.modifiedCount === 0) {
                return { success: false, message: "No competitor found!" }
            }

            return { success: true, message: `${isActive ? "Activated" : "Deactivated"} competitors successfully!` };
        }
        catch (error) {
            console.error("Error updating competitor active status!", error.message);
            await logErrors(error);
            return { success: false, message: "Something went wrong." }
        }
    }

    _isValidScrapeFrequency(scrapeFrequency) {
        return ["Daily", "Every second day", "Once a week"].includes(scrapeFrequency);
    }

    _getTargets(competitorDoc) {
        const target = competitorDoc?.target;
        if (!target) return [];

        return target.split(',').map(t => t.trim());
    }

    /**
     * shouldScrapeToday()
     *
     * Determines if a competitor should be scraped today based on:
     *  - its scrapeFrequency
     *  - how many days have elapsed since its lastScrapedAt
     */
    _shouldScrapeToday(competitor) {
        const { scrapeFrequency, lastScrapedAt } = competitor;

        // If the competitor has never been scraped, scrape it now.
        if (!lastScrapedAt) return true;

        const now = moment();
        const lastScrapedDate = moment(lastScrapedAt);

        const scrapeIntervals = {
            "Daily": moment.duration(1, "days").asMinutes(),
            "Every second day": moment.duration(2, "days").asMinutes(),
            "Once a week": moment.duration(7, "days").asMinutes()
        };

        const differenceInMins = now.diff(lastScrapedDate, "minutes") + 5; // 5 mins buffer 
        if (scrapeFrequency in scrapeIntervals) {
            return differenceInMins >= (scrapeIntervals[scrapeFrequency]);
        }

        console.warn(`Unsupported scrape frequency "${scrapeFrequency}" for competitor ${competitor.competitorUrl}`);
        return false;
    }

    async updateCompetitorScrapeStatus(competitorUrl, updatedStatus, lastScrapedAt, lastScrapeEndTime) {
        // await logInfo(`Updating status for: ${competitorUrl}, newStatus: ${updatedStatus}, lastScrapedAt: ${lastScrapedAt}`, infoSeverity.CRITICAL);
        competitorUrl = getFullUrl("", competitorUrl)
        const db = await connectToMongo();
        const collection = db.collection(collectionsEnum.COMPETITOR_SCRAPE_SCHEDULE);

        await collection.updateOne(
            { competitorUrl },
            {
                $set: {
                    status: updatedStatus,
                    ...(lastScrapedAt && { lastScrapedAt }),
                    ...(lastScrapeEndTime && { lastScrapeEndTime })
                },
            }
        );
    }

    _constructPagination(query) {
        if (query?.pageSize === 'All') {
            return { skip: 0, limit: undefined };
        }

        const page = Number(query.page) || 1;
        const pageSize = Number(query.pageSize) || 25;

        const skip = (page - 1) * pageSize;
        const limit = pageSize;

        return { skip, limit };
    }
}

export default ScrapeScheduler;