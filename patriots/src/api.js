import { flattenStandings, normalizeGames, enteringWeekRecords, historicalStandings, buildTeamMap, rankGames } from "./logic.js";
import { postseasonNumber } from "./postseason.js";

const API = "https://site.api.espn.com/apis";
const weekCache = new Map();

async function getJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("NFL data is unavailable right now.");
  return response.json();
}

export async function getSeason(signal) {
  const data = await getJson(`${API}/site/v2/sports/football/nfl/scoreboard`, signal);
  const weeks = data.leagues[0].calendar.find((period) => period.value === "2").entries;
  const currentWeek = data.season.type === 1 ? 1 : data.season.type === 2 ? data.week.number : 18;
  return { year: data.season.year, currentWeek, weeks };
}

async function getWeek(year, week, signal, cached = false) {
  const key = `${year}:${week}`;
  if (cached && weekCache.has(key)) return weekCache.get(key);
  const data = await getJson(`${API}/site/v2/sports/football/nfl/scoreboard?dates=${year}&seasontype=2&week=${week}`, signal);
  const games = normalizeGames(data);
  if (games.length) weekCache.set(key, games);
  return games;
}

export async function getGuide(season, week, signal) {
  const [standings, games] = await Promise.all([
    getJson(`${API}/v2/sports/football/nfl/standings?season=${season.year}`, signal),
    getWeek(season.year, week, signal),
  ]);
  const records = flattenStandings(standings);
  const historical = week < season.currentWeek;
  const seasonGames = (await Promise.all(season.weeks.map((entry) => {
    const number = Number(entry.value);
    return number === week ? games : getWeek(season.year, number, signal, number !== season.currentWeek);
  }))).flat();
  const earlierGames = seasonGames.filter((game) => game.week < week);
  const rankingRecords = historical
    ? historicalStandings(records, earlierGames)
    : enteringWeekRecords(records, week === season.currentWeek ? games : []);
  const rankingMap = buildTeamMap(rankingRecords);
  const teamMap = historical ? buildTeamMap(historicalStandings(records, [...earlierGames, ...games])) : buildTeamMap(records);
  const asOfWeek = Math.min(week, season.currentWeek);
  const snapshotGames = seasonGames.map((game) => game.week <= asOfWeek ? game : { ...game, status: { type: { completed: false } } });
  const postseason = postseasonNumber(teamMap, snapshotGames);
  return {
    games,
    teamMap,
    postseason,
    historical,
    ...rankGames(games, rankingMap),
  };
}
