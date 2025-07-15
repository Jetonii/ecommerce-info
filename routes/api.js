import { Router } from 'express';
import SiteAuditor from '../modules/siteAuditor/siteAuditor.js';
import productDetailsRepo from '../src/scraper/productPageScraper/productDetailsRepo.js';
import Scraper from '../src/scraper/scraper.js';
import { isValidUrl } from '../utils/urlUtils.js';

const router = Router();

router.get("/health", (req, res) => {
    res.status(200).send({ success: true, message: "Healthy!" });
});

router.get("/audit-site/start", async (req, res) => {
    try {
        const { siteUrl, willBeScraped } = req.query;
        if (!siteUrl) {
            return res.status(400).send({ message: "SiteUrl is required!" });
        }

        if (!isValidUrl(siteUrl)) {
            return res.status(400).send({ message: "Given url is invalid!" })
        }

        res.status(200).send({ success: true, message: 'Site auditing started successfully!' });

        const auditor = new SiteAuditor(siteUrl);
        await auditor.audit(willBeScraped);
    } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, message: `Error during site audit ${err}` });
    }
});

router.get('/metrics/competitor-overview', async (req, res) => {
    try {
        if (!req.query.startDate || !req.query.endDate || !req.query.selectedTarget) {
            return res.status(400).json({ error: "Missing one or more required params: startDate, endDate, selectedTarget, category!" });
        }

        const result = await productDetailsRepo.getAggregatedFactors(req.query);

        console.log(result);
        return res.status(result ? 200 : 404).json(result);
    } catch (error) {
        console.error("Error fetching aggregated factors:", error);
        res.status(500).json({ error: "Failed to fetch aggregated factors" });
    }
});


export default router;
