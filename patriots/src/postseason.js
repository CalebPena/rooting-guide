import { PATRIOTS_ID } from "./logic.js";

const SEASON_LENGTH = 17;
const effectiveWins = (record) => record.wins + record.ties / 2;
const remainingGames = (record) => SEASON_LENGTH - record.wins - record.losses - record.ties;
const maximumWins = (record) => effectiveWins(record) + remainingGames(record);

function teamResults(teamId, games) {
  return games.flatMap((game) => {
    const sides = [game.teams.away, game.teams.home];
    const side = sides.find((side) => side.team.id === teamId);
    if (!side) return [];
    const opponent = sides.find((opponent) => opponent !== side);
    return [{ opponentId: opponent.team.id, completed: game.status.type.completed, value: side.score === opponent.score ? 0.5 : side.score > opponent.score ? 1 : 0 }];
  });
}

// Only return a winner when no remaining game can reverse this tiebreaker.
function securedTiebreaker(left, right, records, games) {
  const leftGames = teamResults(left.team.id, games);
  const rightGames = teamResults(right.team.id, games);
  const afcIds = new Set(records.map((record) => record.team.id));
  const sameDivision = left.divisionId === right.divisionId;
  const divisionIds = new Set(records.filter((record) => record.divisionId === left.divisionId).map((record) => record.team.id));
  const commonIds = new Set(leftGames.map((game) => game.opponentId).filter((id) => rightGames.some((game) => game.opponentId === id)));
  const criteria = [
    [(game) => game.opponentId === right.team.id, (game) => game.opponentId === left.team.id],
    ...(sameDivision ? [
      [(game) => divisionIds.has(game.opponentId)],
      [(game) => commonIds.has(game.opponentId)],
      [(game) => afcIds.has(game.opponentId)],
    ] : [
      [(game) => afcIds.has(game.opponentId)],
      ...(leftGames.filter((game) => commonIds.has(game.opponentId)).length >= 4 && rightGames.filter((game) => commonIds.has(game.opponentId)).length >= 4 ? [[(game) => commonIds.has(game.opponentId)]] : []),
    ]),
  ];
  const bounds = (list) => {
    if (!list.length) return { min: 0, max: 0 };
    const won = list.filter((game) => game.completed).reduce((sum, game) => sum + game.value, 0);
    const unplayed = list.filter((game) => !game.completed).length;
    return { min: won / list.length, max: (won + unplayed) / list.length };
  };
  for (const [leftFilter, rightFilter = leftFilter] of criteria) {
    const a = bounds(leftGames.filter(leftFilter));
    const b = bounds(rightGames.filter(rightFilter));
    if (a.min > b.max) return 1;
    if (b.min > a.max) return -1;
    if (a.min !== a.max || b.min !== b.max || a.min !== b.min) return 0;
  }
  // Strength of victory, strength of schedule, and scoring can still change.
  // A current seed (or an alphabetical fallback) is not a secured tiebreaker.
  return 0;
}

function tiebreakerCredit(team, opponent, records, games, targetWins, division) {
  const others = records.filter((record) => record.team.id !== team.team.id && record.team.id !== opponent.team.id && (!division || record.divisionId === team.divisionId));
  // Pairwise tiebreakers alone do not settle a possible three-way tie.
  if (others.some((record) => effectiveWins(record) <= targetWins && maximumWins(record) >= targetWins)) return false;
  return securedTiebreaker(team, opponent, records, games) === 1;
}

function magicAgainst(team, opponent, records, games, division) {
  const target = maximumWins(opponent);
  const credit = tiebreakerCredit(team, opponent, records, games, target, division);
  const difference = target - effectiveWins(team);
  return { rival: opponent, number: Math.max(0, credit ? Math.ceil(difference) : Math.floor(difference) + 1), tiebreaker: credit };
}

function eliminationAgainst(team, opponent, records, games, division) {
  const target = maximumWins(team);
  const credit = tiebreakerCredit(opponent, team, records, games, target, division);
  const difference = target - effectiveWins(opponent);
  return { rival: opponent, number: Math.max(0, credit ? Math.ceil(difference) : Math.floor(difference) + 1), tiebreaker: credit };
}

// One team from each division gets a division berth. Remove that team's
// bound, then use the third remaining rival to find the three-wild-card cutoff.
function wildCardCutoff(comparisons, descending) {
  const order = descending ? (a, b) => b.number - a.number : (a, b) => a.number - b.number;
  const divisions = [...new Set(comparisons.map(({ rival }) => rival.divisionId))];
  const contenders = divisions.flatMap((divisionId) => {
    const division = comparisons.filter(({ rival }) => rival.divisionId === divisionId).sort(order);
    return division.slice(1);
  }).sort(order);
  return contenders[2];
}

export function postseasonNumber(teamMap, games) {
  const records = [...teamMap.values()];
  const patriots = teamMap.get(PATRIOTS_ID);
  const rivals = records.filter((record) => record.team.id !== PATRIOTS_ID);
  const divisionRivals = rivals.filter((record) => record.divisionId === patriots.divisionId);
  const divisionMagic = divisionRivals.map((record) => magicAgainst(patriots, record, records, games, true)).sort((a, b) => b.number - a.number)[0];
  const wildCardMagic = wildCardCutoff(rivals.map((record) => magicAgainst(patriots, record, records, games, false)), true);
  const divisionTragic = divisionRivals.map((record) => eliminationAgainst(patriots, record, records, games, true)).sort((a, b) => a.number - b.number)[0];
  const wildCardTragic = wildCardCutoff(rivals.map((record) => eliminationAgainst(patriots, record, records, games, false)), false);
  const divisionLeader = patriots.playoffSeed >= 1 && patriots.playoffSeed <= 4;
  const inPlayoffs = patriots.playoffSeed >= 1 && patriots.playoffSeed <= 7;
  const finished = records.every((record) => remainingGames(record) === 0);

  if (finished) {
    return { kind: inPlayoffs ? "clinched" : "eliminated", path: divisionLeader ? "Division" : "Playoff", number: 0, rival: null };
  }
  if (divisionLeader) return { ...divisionMagic, kind: divisionMagic.number === 0 ? "clinched" : "magic", path: "Division" };
  if (inPlayoffs) return { ...wildCardMagic, kind: wildCardMagic.number === 0 ? "clinched" : "magic", path: "Wild-card" };
  if (divisionMagic.number === 0 || wildCardMagic.number === 0) return { kind: "clinched", path: "Playoff", number: 0, rival: null };
  // Elimination requires losing both the division and wild-card paths.
  const tragic = divisionTragic.number > wildCardTragic.number ? divisionTragic : wildCardTragic;
  return { ...tragic, kind: tragic.number === 0 ? "eliminated" : "tragic", path: tragic === divisionTragic ? "Division" : "Wild-card" };
}
