import { Router } from 'express';
import ScrapeScheduler from '../src/modules/scrapeScheduler/scrapeScheduler.js';
import { getFullUrl } from '../src/common/utils/urlUtils.js';

const router = Router();
const scrapeScheduler = new ScrapeScheduler();

/**
 * GET /run-scrape
 *
 * This endpoint is called (via crontab) once a day.
 * It checks each competitor's lastScrapedAt timestamp and its scrapeFrequency
 * to decide if it needs to run the scraper for that competitor.
 */

// Todo: Add the crontab to the vm: 0 1 * * * curl localhost:XXXX/api/competitors/run-scrape?token=ykdwxoes924
router.post("/run-scrape", async (req, res) => {
    const token = req.query.token;
    if (!token || token !== "ykdwxoes924") {
        return res.status(401).json({ message: "Unauthorized" });
    }

    console.log("Running scrape for all");
    res.status(200).json({ message: "Running scrape..." });
    await scrapeScheduler.run();
});

router.post("/scrape-competitor", async (req, res) => {
    let { competitorUrl } = req.query;

    if (!competitorUrl) {
        return res.status(400).send("CompetitorUrl is required!");
    }

    competitorUrl = getFullUrl("", competitorUrl);

    console.log("Running scrape for competitor: ", competitorUrl);
    res.status(200).json({ message: "Started running scrape successfully!..." });
    await scrapeScheduler.runCompetitor(competitorUrl);
});

/**
 * GET /run-scrape
 *
 * This endpoint is called (via crontab) once a day.
 * It checks each competitor's lastScrapedAt timestamp and its scrapeFrequency
 * to decide if it needs to run the scraper for that competitor.
 */

router.get("/search", async (req, res) => {
    const { target, scrapeFrequency, page, pageSize } = req.query;

    if (!target) {
        return res.status(400).json("Missing required field: target!");
    }

    const scrapeScheduler = new ScrapeScheduler();
    const response = await scrapeScheduler.searchCompetitors(target, scrapeFrequency?.trim(), page, pageSize);
    if (response.success) {
        return res.status(200).json({ competitors: response.competitors, status: response.status, isActive: response.isActive });
    }
    return res.status(400).json(response.message);
});

router.post("/add", async (req, res) => {
    const { target, competitorName, competitorUrl, scrapeFrequency } = req.body;
    const fullUrl = getFullUrl("", competitorUrl);

    const scrapeScheduler = new ScrapeScheduler();
    const response = await scrapeScheduler.addCompetitor(target, competitorName, fullUrl, scrapeFrequency?.trim());
    if (response.success) {
        res.status(200).json(response.message);
        await scrapeScheduler.runCompetitor(fullUrl);
    } else {
        return res.status(400).json(response.message);
    }
});

router.patch("/", async (req, res) => {
    const { competitorUrl, scrapeFrequency } = req.query;
    const fullUrl = getFullUrl("", competitorUrl);

    const scrapeScheduler = new ScrapeScheduler();
    const response = await scrapeScheduler.updateCompetitor(null, null, fullUrl, scrapeFrequency?.trim());
    if (response.success) {
        return res.status(200).json(response.message);
    }
    return res.status(404).json(response.message);
});

router.post("/update-active-status", async (req, res) => {
    const { target, scrapeFrequency, isActive } = req.body;

    if (!target || !scrapeFrequency || typeof isActive === "undefined") {
        return res.status(400).json('Missing required param(s)! Required params: target, scrapeFrequency, isActive');
    }

    const scrapeScheduler = new ScrapeScheduler();
    const response = await scrapeScheduler.updateCompetitorActiveStatus(target, scrapeFrequency, isActive);
    if (response.success) {
        return res.status(200).json(response.message);
    }
    return res.status(404).json(response.message);
});

router.delete("/", async (req, res) => {
    const { competitorUrl, target } = req.query;
    const fullUrl = getFullUrl("", competitorUrl);

    const scrapeScheduler = new ScrapeScheduler();
    const response = await scrapeScheduler.deleteCompetitor(target, fullUrl);
    if (response.success) {
        return res.status(200).json(response.message);
    }
    return res.status(404).json(response.message);
});

export default router;