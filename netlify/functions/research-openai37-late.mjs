/** Second half of the same four-per-day research schedule. GET only. */
import {runResearchSchedule38} from './research-openai37.mjs';
export const config={schedule:'0,45 23 * * 1-5'};
export default async function handler(){return runResearchSchedule38();}
