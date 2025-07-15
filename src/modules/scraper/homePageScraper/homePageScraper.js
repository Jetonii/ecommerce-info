import categoryRepo from "./categoryRepo.js";
import { aiService } from "../../../common/AIService/AIService.js";
import matchedCategoryRepo from "./matchedCategoryRepo.js";

export default class HomePageScraper {
  constructor() {
    this.categoryRepo = categoryRepo;
    this.matchedCategoryRepo = matchedCategoryRepo;
  }

  async copyFromMongo(homePageInfo, domain) {
    if (!homePageInfo) return;

    const { mainCategories, categories, subCategories } = homePageInfo;
    const allCategories = [...mainCategories, ...categories, ...subCategories];

    const existingCategories = new Set(await this.categoryRepo.getCategoryUrlsByTarget(domain));
    const uniqueCategories = allCategories.filter(({ url }) => {
      const categoryKey = url;
      if (existingCategories.has(categoryKey)) {
        return false;
      }

      existingCategories.add(categoryKey);
      return true;
    });

    if (uniqueCategories?.length > 0) {
      await this.saveToClickHouse(uniqueCategories, domain);
    }
  }

  async findMatchedCategories(target, competitor, homePageInfo) {
    try {
      console.log("Finding matched categories: ", target, competitor);
      const allTargetCategories = await this.matchedCategoryRepo.getTargetCategories(target);
      if (!allTargetCategories || allTargetCategories.length === 0) return;

      const previouslyMatched = await this.matchedCategoryRepo.getAlreadyMatchedCategories(target, competitor);
      const previouslyMatchedSet = new Set(previouslyMatched.map(x => x.toLowerCase()));

      const newTargetCategories = allTargetCategories.filter(c => !previouslyMatchedSet.has(c.toLowerCase()));
      if (newTargetCategories.length === 0) return;

      const { mainCategories, categories, subCategories } = homePageInfo;
      const competitorCategories = [...mainCategories, ...categories, ...subCategories];

      const response = await aiService.getMatchedCategories(newTargetCategories, competitorCategories.map(c => c.name));
      const matchedCategories = response.map(match => ({
        target,
        competitor,
        targetCategory: match.list1, 
        competitorCategory: match.list2
      }));

      if (matchedCategories.length) {
        await this.matchedCategoryRepo.create(target, matchedCategories);
        console.log(`Created ${matchedCategories.length} new matched categories for target '${target}' and competitor '${competitor}'.`);
      } else {
        console.log(`No new matches found for target '${target}' and competitor '${competitor}'.`);
      }
    } catch (error) {
      console.error("Error in findMatchedCategories!", error);
    }
  }

  async saveToClickHouse(categories, domain) {
    const validCategories = categories?.filter(category => category.url) || [];
    if (validCategories.length) {
      console.log(`Saving ${validCategories.length} categories to ClickHouse!`);
      await this.categoryRepo.create(domain, validCategories);
    }
  }
}