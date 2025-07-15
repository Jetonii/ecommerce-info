export const collectionsEnum = {
    TARGETS_INFO: 'auditTargetsInfo',
    AI_USAGE_REPORT: 'auditAIUsageReport',
    PRODUCT_LINKS: 'auditProductLinks',
    COMPETITOR_SCRAPE_SCHEDULE: "competitorScrapeSchedule"
};

export const infoSeverity = {
    CRITICAL: "Critical",
    INFO: "Info",
    WARNING: "Warning"
};

export const crawlMethodEnum = {
    PUPPETEER: "puppeteer",
    AXIOS: "axios",
}

export const scrapeStatus = {
    RUNNING: "Running",
    NOT_RUNNING: "Not Running"
}

export const urlTypeEnum = {
    PRODUCT_PAGE: "productPage",
    CATEGORY: "category"
}