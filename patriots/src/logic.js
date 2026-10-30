export const PATRIOTS_ID = "17";

const DIVISIONS = {
  East: ["2", "15", "17", "20"],
  North: ["4", "5", "23", "33"],
  South: ["11", "30", "10", "34"],
  West: ["7", "12", "13", "24"],
};

export function relativeGap(team, patriots) {
  return (team.wins - patriots.wins + patriots.losses - team.losses) / 2;
}

export function flattenStandings(data) {
  const conference = data.children.find((group) => group.abbreviation === "AFC");
  if (!conference?.standings?.entries?.length) throw new Error("AFC standings are unavailable.");
  return conference.standings.entries.map(({ team, stats }) => {
    const values = Object.fromEntries(stats.map((stat) => [stat.name, stat.value]));
    const divisionId = Object.keys(DIVISIONS).find((division) => DIVISIONS[division].includes(team.id));
    return { team, divisionId, wins: values.wins, losses: values.losses, ties: values.ties ?? 0, playoffSeed: values.playoffSeed };
  });
}

export function normalizeGames(data) {
  return data.events.map((event) => {
    const competition = event.competitions[0];
    return {
      id: event.id,
      week: event.week.number,
      date: event.date,
      status: competition.status ?? event.status,
      situation: competition.situation ?? null,
      venue: competition.venue?.fullName,
      teams: Object.fromEntries(competition.competitors.map((side) => [side.homeAway, {
        team: side.team,
        score: Number(side.score),
      }])),
    };
  });
}

export function liveFieldState(game, leftTeamId) {
  const situation = game.situation;
  if (game.status.type.state !== "in" || !situation) return null;
  const sides = Object.values(game.teams);
  const possession = sides.find((side) => side.team.id === String(situation.possession))?.team;
  if (!possession) return null;
  const left = sides.find((side) => side.team.id === leftTeamId).team;
  const right = sides.find((side) => side.team.id !== leftTeamId).team;
  const direction = possession.id === left.id ? 1 : -1;
  const positionText = situation.possessionText?.trim() ?? "";
  const position = positionText.match(/^([A-Z]+)\s+(\d+(?:\.\d+)?)$/i);
  let yard = null;
  if (position && Number(position[2]) <= 50) {
    const side = sides.find((side) => side.team.abbreviation.toUpperCase() === position[1].toUpperCase());
    if (side) yard = side.team.id === left.id ? Number(position[2]) : 100 - Number(position[2]);
  } else if (positionText === "50") {
    yard = 50;
  }
  // ESPN's absolute yardLine runs from the home goal (0) to the away goal (100).
  if (yard === null && Number.isFinite(situation.yardLine) && situation.yardLine >= 0 && situation.yardLine <= 100) {
    yard = left.id === game.teams.home.team.id ? situation.yardLine : 100 - situation.yardLine;
  }
  const down = Number.isInteger(situation.down) && situation.down >= 1 && situation.down <= 4 ? situation.down : null;
  const distance = Number.isFinite(situation.distance) && situation.distance >= 0 ? situation.distance : null;
  const downDistance = situation.shortDownDistanceText || situation.downDistanceText?.split(/\s+at\s+/i)[0] || (down !== null && distance !== null ? `${down}${["st", "nd", "rd", "th"][down - 1]} & ${distance}` : null);
  const fieldPosition = positionText || (yard === null ? null : yard === 50 ? "50" : `${yard < 50 ? left.abbreviation : right.abbreviation} ${Math.min(yard, 100 - yard)}`);
  return {
    possession,
    direction,
    yard,
    firstDownYard: yard !== null && down !== null && distance !== null ? Math.max(0, Math.min(100, yard + direction * distance)) : null,
    downDistance,
    fieldPosition,
  };
}

// Keep completed results from changing the week's original rooting choices.
export function enteringWeekRecords(records, completedGames, historical = false) {
  const map = new Map(records.map((record) => [record.team.id, {
    ...record,
    wins: historical ? 0 : record.wins,
    losses: historical ? 0 : record.losses,
    ties: historical ? 0 : record.ties,
    playoffSeed: historical ? null : record.playoffSeed,
  }]));
  for (const game of completedGames.filter((game) => game.status.type.completed)) {
    const sides = [game.teams.away, game.teams.home];
    sides.forEach((side, index) => {
      const record = map.get(side.team.id);
      if (!record) return;
      const field = side.score === sides[1 - index].score ? "ties" : side.score > sides[1 - index].score ? "wins" : "losses";
      record[field] += historical ? 1 : -1;
    });
  }
  return [...map.values()];
}

export function historicalStandings(records, games) {
  const completed = games.filter((game) => game.status.type.completed);
  const afcIds = new Set(records.map((record) => record.team.id));
  const totals = new Map();
  const results = new Map();
  for (const game of completed) {
    const sides = [game.teams.away, game.teams.home];
    sides.forEach((side, index) => {
      const opponent = sides[1 - index];
      const result = { opponent: opponent.team.id, pointsFor: side.score, pointsAgainst: opponent.score, value: side.score === opponent.score ? 0.5 : side.score > opponent.score ? 1 : 0 };
      if (!results.has(side.team.id)) results.set(side.team.id, []);
      results.get(side.team.id).push(result);
      if (!totals.has(side.team.id)) totals.set(side.team.id, { wins: 0, losses: 0, ties: 0 });
      totals.get(side.team.id)[result.value === 0.5 ? "ties" : result.value === 1 ? "wins" : "losses"] += 1;
    });
  }
  const percentage = (list) => list.length ? list.reduce((sum, game) => sum + game.value, 0) / list.length : 0;
  const teamGames = (team) => results.get(team.team.id) ?? [];
  const strength = (list) => {
    const opponents = list.map((game) => totals.get(game.opponent));
    const played = opponents.reduce((sum, record) => sum + record.wins + record.losses + record.ties, 0);
    return played ? opponents.reduce((sum, record) => sum + record.wins + record.ties / 2, 0) / played : 0;
  };
  const standings = enteringWeekRecords(records, completed, true);
  const pointRanks = (ids) => {
    const teams = [...ids].map((id) => ({ id, games: results.get(id) ?? [] }));
    const scored = (team) => team.games.reduce((sum, game) => sum + game.pointsFor, 0);
    const allowed = (team) => team.games.reduce((sum, game) => sum + game.pointsAgainst, 0);
    return new Map(teams.map((team) => [team.id,
      2 + teams.filter((other) => scored(other) > scored(team)).length + teams.filter((other) => allowed(other) < allowed(team)).length,
    ]));
  };
  const conferencePointRanks = pointRanks(afcIds);
  const leaguePointRanks = pointRanks(new Set([...afcIds, ...results.keys()]));

  function first(pool, division) {
    if (pool.length === 1) return pool[0];
    const tiedIds = new Set(pool.map((team) => team.team.id));
    const common = teamGames(pool[0]).map((game) => game.opponent).filter((id) => pool.every((team) => teamGames(team).some((game) => game.opponent === id)));
    const commonGames = (team) => teamGames(team).filter((game) => common.includes(game.opponent));
    const headToHead = (team) => teamGames(team).filter((game) => tiedIds.has(game.opponent));
    const conferenceGames = (team) => teamGames(team).filter((game) => afcIds.has(game.opponent));
    const divisionGames = (team) => teamGames(team).filter((game) => DIVISIONS[team.divisionId].includes(game.opponent));
    const netPoints = (list) => list.reduce((sum, game) => sum + game.pointsFor - game.pointsAgainst, 0);
    const sweep = (team) => {
      const played = headToHead(team);
      const metEveryone = pool.every((other) => other === team || played.some((game) => game.opponent === other.team.id));
      return metEveryone && played.every((game) => game.value === 1) ? 1 : metEveryone && played.every((game) => game.value === 0) ? -1 : 0;
    };
    const criteria = [
      (team) => percentage(teamGames(team)),
      division || pool.length === 2 ? (team) => headToHead(team).length ? percentage(headToHead(team)) : 0.5 : sweep,
      ...(division ? [
        (team) => percentage(divisionGames(team)),
        (team) => percentage(commonGames(team)),
        (team) => percentage(conferenceGames(team)),
      ] : [
        (team) => percentage(conferenceGames(team)),
        (team) => pool.every((candidate) => commonGames(candidate).length >= 4) ? percentage(commonGames(team)) : 0,
      ]),
      (team) => strength(teamGames(team).filter((game) => game.value === 1)),
      (team) => strength(teamGames(team)),
      (team) => -conferencePointRanks.get(team.team.id),
      (team) => -leaguePointRanks.get(team.team.id),
      (team) => netPoints(division ? commonGames(team) : conferenceGames(team)),
      (team) => netPoints(teamGames(team)),
    ];
    for (const criterion of criteria) {
      const best = Math.max(...pool.map(criterion));
      const remaining = pool.filter((team) => Math.abs(criterion(team) - best) < 1e-9);
      if (remaining.length < pool.length) return first(remaining, division);
    }
    return [...pool].sort((a, b) => a.team.name.localeCompare(b.team.name))[0];
  }

  function ordered(pool, division) {
    const remaining = [...pool];
    const ranked = [];
    while (remaining.length) {
      const candidates = division ? remaining : Object.keys(DIVISIONS).flatMap((id) => {
        const members = remaining.filter((team) => team.divisionId === id);
        return members.length ? [first(members, true)] : [];
      });
      const winner = first(candidates, division);
      ranked.push(winner);
      remaining.splice(remaining.indexOf(winner), 1);
    }
    return ranked;
  }

  for (const division of Object.keys(DIVISIONS)) {
    ordered(standings.filter((team) => team.divisionId === division), true).forEach((team, index) => { team.divisionRank = index + 1; });
  }
  const leaders = ordered(standings.filter((team) => team.divisionRank === 1), false);
  const others = ordered(standings.filter((team) => team.divisionRank !== 1), false);
  [...leaders, ...others].forEach((team, index) => { team.playoffSeed = index + 1; });
  return standings;
}

export function buildTeamMap(records) {
  const patriots = records.find((record) => record.team.id === PATRIOTS_ID);
  if (!patriots) throw new Error("New England is missing from the AFC standings.");
  const teams = records.map((record) => {
    const gamesPlayed = record.wins + record.losses + record.ties;
    return { ...record, gamesPlayed, gap: relativeGap(record, patriots), winningPercentage: gamesPlayed ? (record.wins + record.ties / 2) / gamesPlayed : 0.5 };
  });
  const order = (a, b) => b.winningPercentage - a.winningPercentage || (a.playoffSeed || 99) - (b.playoffSeed || 99) || a.team.name.localeCompare(b.team.name);
  for (const division of Object.keys(DIVISIONS)) {
    teams.filter((team) => team.divisionId === division).sort(order).forEach((team, index) => { team.divisionRank ??= index + 1; });
  }
  const divisionLeader = teams.find((team) => team.divisionId === patriots.divisionId && team.divisionRank === 1);
  return new Map(teams.map((record) => {
    let distance = Math.abs(record.gap);
    if (record.divisionId !== patriots.divisionId && record.divisionRank === 1) {
      const runnerUp = teams.find((team) => team.divisionId === record.divisionId && team.divisionRank === 2);
      const wildCardPath = Math.max(0, relativeGap(record, runnerUp)) + Math.abs(relativeGap(runnerUp, patriots));
      const divisionWinnerPath = Math.max(0, relativeGap(divisionLeader, patriots)) + Math.abs(relativeGap(record, divisionLeader));
      distance = Math.min(wildCardPath, divisionWinnerPath);
    }
    return [record.team.id, { ...record, distance, threat: record.winningPercentage / (1 + distance), eligible: record.team.id !== PATRIOTS_ID }];
  }));
}

export function rankGames(games, teamMap) {
  const patriotsGames = games.filter((game) => Object.values(game.teams).some((side) => side.team.id === PATRIOTS_ID));
  const recommendations = games.filter((game) => !patriotsGames.includes(game)).map((game) => {
    const sides = [game.teams.away, game.teams.home];
    const targets = sides.map((side) => teamMap.get(side.team.id)).filter((record) => record?.eligible)
      .sort((a, b) => b.threat - a.threat || a.distance - b.distance || b.gap - a.gap);
    if (!targets.length) return null;
    const target = targets[0];
    const targetSide = sides.find((side) => side.team.id === target.team.id);
    const rootForSide = sides.find((side) => side !== targetSide);
    const rankingDifference = target.threat - (teamMap.get(rootForSide.team.id)?.threat ?? 0);
    if (rankingDifference < 0.000001) return null;
    return { game, target, targetSide, rootForSide, rankingDifference };
  }).filter(Boolean).sort((a, b) => b.rankingDifference - a.rankingDifference || b.target.threat - a.target.threat || new Date(a.game.date) - new Date(b.game.date)).slice(0, 5);
  return { patriotsGames, recommendations };
}
