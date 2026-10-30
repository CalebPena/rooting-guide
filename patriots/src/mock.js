import { PATRIOTS_ID } from "./logic.js";

function mockLiveGame(game, rootTeamId, situation) {
  const rootSide = game.teams.away.team.id === rootTeamId ? "away" : "home";
  const targetSide = rootSide === "away" ? "home" : "away";
  const possessingSide = situation.rootPossession ? rootSide : targetSide;
  const otherSide = possessingSide === "away" ? "home" : "away";
  const possession = game.teams[possessingSide].team;
  const fieldTeam = game.teams[situation.opponentTerritory ? otherSide : possessingSide].team;
  const yard = situation.opponentTerritory ? 100 - situation.yard : situation.yard;
  return {
    ...game,
    isMock: true,
    status: {
      period: situation.period,
      displayClock: situation.clock,
      type: { state: "in", completed: false, shortDetail: `${situation.clock} · ${situation.period}${["st", "nd", "rd", "th"][situation.period - 1]}` },
    },
    teams: {
      [rootSide]: { ...game.teams[rootSide], score: situation.scores[0] },
      [targetSide]: { ...game.teams[targetSide], score: situation.scores[1] },
    },
    situation: {
      possession: possession.id,
      possessionText: `${fieldTeam.abbreviation} ${situation.yard}`,
      yardLine: possessingSide === "home" ? yard : 100 - yard,
      down: situation.down,
      distance: situation.distance,
      shortDownDistanceText: `${situation.down}${["st", "nd", "rd", "th"][situation.down - 1]} & ${situation.goal ? "Goal" : situation.distance}`,
    },
  };
}

export function mockLiveGuide(data) {
  const source = data.patriotsGames[0] ?? {
    id: "mock-patriots-game",
    date: new Date().toISOString(),
    teams: { away: { team: data.teamMap.get(PATRIOTS_ID).team }, home: { team: data.teamMap.get("15").team } },
  };
  const patriotsGame = mockLiveGame(source, PATRIOTS_ID, {
    rootPossession: true, scores: [24, 17], period: 3, clock: "8:42", yard: 35, down: 3, distance: 7,
  });
  const situations = [
    { rootPossession: true, scores: [21, 14], period: 3, clock: "6:18", yard: 22, down: 2, distance: 6, opponentTerritory: true },
    { rootPossession: false, scores: [10, 13], period: 2, clock: "2:35", yard: 42, down: 1, distance: 10 },
    { rootPossession: true, scores: [17, 17], period: 4, clock: "4:09", yard: 5, down: 2, distance: 5, opponentTerritory: true, goal: true },
    { rootPossession: false, scores: [28, 21], period: 4, clock: "1:52", yard: 38, down: 4, distance: 2, opponentTerritory: true },
    { rootPossession: true, scores: [7, 3], period: 1, clock: "3:26", yard: 12, down: 1, distance: 10 },
  ];
  const recommendations = data.recommendations.map((item, index) => {
    const game = mockLiveGame(item.game, item.rootForSide.team.id, situations[index % situations.length]);
    const sides = Object.values(game.teams);
    return { ...item, game, rootForSide: sides.find((side) => side.team.id === item.rootForSide.team.id), targetSide: sides.find((side) => side.team.id === item.targetSide.team.id) };
  });
  return { ...data, patriotsGames: [patriotsGame], recommendations };
}
