import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PATRIOTS_ID, liveFieldState } from "./logic.js";
import { getSeason, getGuide } from "./api.js";
import { mockLiveGuide } from "./mock.js";
import "./styles.css";

const SHOW_LIVE_MOCK = new URLSearchParams(window.location.search).get("mock") === "live";

function Gap({ gap, home = false }) {
  const label = gap === 0 ? "Even with New England" : `${Math.abs(gap)} games ${gap > 0 ? "ahead of" : "behind"} New England`;
  return <strong className={`gap ${gap > 0 ? "gap--ahead" : gap < 0 ? "gap--behind" : ""}`} title={label} aria-label={label}>{home ? "NE" : <><span aria-hidden="true">{gap === 0 ? "↔" : gap > 0 ? "↑" : "↓"}</span> {Math.abs(gap)}</>}</strong>;
}

function gameTime(game) {
  if (game.status.type.state !== "pre") return game.status.type.shortDetail;
  if (/postponed|cancel|delay/i.test(game.status.type.name)) return game.status.type.description;
  return new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }).format(new Date(game.date));
}

function Team({ side, teamMap }) {
  const standing = teamMap.get(side.team.id);
  return <div className="matchup-team">
    <h3>{side.team.name}</h3>
    {standing && side.team.id !== PATRIOTS_ID && <Gap gap={standing.gap} />}
  </div>;
}

function LiveField({ game, leftTeamId }) {
  const field = liveFieldState(game, leftTeamId);
  if (!field) return <span>{gameTime(game)}</span>;
  const x = (yard) => 10 + yard * 0.8;
  const label = [
    `${field.possession.name} possession`,
    field.downDistance,
    field.fieldPosition ? `Ball at ${field.fieldPosition}` : null,
  ].filter(Boolean).join(" · ");
  return <div className="live-field" role="img" aria-label={label} title={label}>
    <span className="live-field__possession" aria-hidden="true">{field.direction === -1 && "← "}{field.possession.abbreviation}{field.direction === 1 && " →"}</span>
    {field.yard !== null && <svg className="live-field__diagram" viewBox="0 0 100 36" aria-hidden="true">
      <rect className="live-field__outline" x="2" y="3" width="96" height="30" rx="1" />
      <path className="live-field__endzones" d="M2 3h8v30H2zM90 3h8v30h-8z" />
      {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((yard) => <line className="live-field__yard-line" key={yard} x1={x(yard)} x2={x(yard)} y1="4" y2="32" />)}
      {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((yard) => <path className="live-field__hash" key={yard} d={`M${x(yard) - 1} 12h2M${x(yard) - 1} 24h2`} />)}
      {field.firstDownYard !== null && <line className="live-field__first-down" x1={x(field.firstDownYard)} x2={x(field.firstDownYard)} y1="4" y2="32" />}
      <line className="live-field__scrimmage" x1={x(field.yard)} x2={x(field.yard)} y1="4" y2="32" />
      <ellipse className="live-field__ball" cx={x(field.yard)} cy="18" rx="4.5" ry="2.6" transform={`rotate(-25 ${x(field.yard)} 18)`} />
    </svg>}
    {field.downDistance && <span className="live-field__down" aria-hidden="true">{field.downDistance}</span>}
    {field.fieldPosition && <span className="live-field__position" aria-hidden="true">{field.fieldPosition}</span>}
  </div>;
}

function GameCard({ game, rootForSide, targetSide, teamMap, rank, patriots = false, magicNumberRivalId }) {
  const hasScore = game.status.type.state === "in" || game.status.type.completed;
  const final = game.status.type.completed;
  const result = !final ? "" : rootForSide.score === targetSide.score ? "neutral" : rootForSide.score > targetSide.score ? "favorable" : "unfavorable";
  const resultLabel = result === "neutral" ? "Tie" : patriots ? result === "favorable" ? "Pats win" : "Pats lose" : result === "favorable" ? "Favorable" : "Unfavorable";
  const separator = game.teams.away.team.id === rootForSide.team.id ? "at" : "vs";
  return <article className={`game-card ${patriots ? "game-card--patriots" : ""} ${result ? `game-card--${result}` : ""}`}>
    <div className="game-heading">
      <p className="eyebrow">{patriots ? "New England’s matchup" : String(rank).padStart(2, "0")}{patriots && game.isMock && <span className="mock-badge">Mock live view</span>}</p>
      {!patriots && <span className="pick-label">New England’s pick</span>}
      <div className="game-status">
        {targetSide.team.id === magicNumberRivalId && <span className="magic-impact" title="A favorable result helps New England’s magic number">Magic number impact</span>}
        {final ? <strong className="result-badge">{result === "favorable" ? "✓ " : result === "unfavorable" ? "× " : ""}{resultLabel}</strong> : <span>{[gameTime(game), patriots && game.status.type.state === "pre" ? game.venue : null].filter(Boolean).join(" · ")}</span>}
      </div>
    </div>
    <div className="matchup">
      <Team side={rootForSide} teamMap={teamMap} />
      <span className="separator">{separator}</span>
      <Team side={targetSide} teamMap={teamMap} />
    </div>
    {hasScore && <div className="scoreline" aria-label={`${rootForSide.team.name} ${rootForSide.score}, ${targetSide.team.name} ${targetSide.score}`}>
      <strong>{rootForSide.score}</strong>{game.status.type.state === "in" ? <LiveField game={game} leftTeamId={rootForSide.team.id} /> : <span>Score</span>}<strong>{targetSide.score}</strong>
    </div>}
  </article>;
}

function opponentLabel(teamId, games) {
  const game = games.find((game) => Object.values(game.teams).some((side) => side.team.id === teamId));
  if (!game) return "Bye";
  const away = game.teams.away.team.id === teamId;
  return `${away ? "at" : "vs"} ${game.teams[away ? "home" : "away"].team.abbreviation}`;
}

function PostseasonNumber({ postseason }) {
  const { kind, path, number, rival, tiebreaker } = postseason;
  const label = kind === "clinched" ? `${path} clinched` : kind === "eliminated" ? "Eliminated from playoff contention" : `${path} ${kind === "magic" ? "magic" : "tragic"} number: ${number}${rival ? ` · ${rival.team.name}` : ""}${tiebreaker ? " · Secured tiebreaker included" : ""}`;
  return <strong className="gap" title={label} aria-label={label}>{kind === "eliminated" ? "ELIM" : `${kind === "magic" || kind === "clinched" ? "M#" : "T#"} ${number}`}</strong>;
}

function Standings({ data }) {
  const teams = [...data.teamMap.values()].sort((a, b) => b.gap - a.gap || (a.playoffSeed || 99) - (b.playoffSeed || 99));
  return <aside className="standings">
    <div className="section-heading"><h2>Standings</h2></div>
    <div className="race-list">{teams.map((record) => {
      const patriots = record.team.id === PATRIOTS_ID;
      const playoff = record.playoffSeed >= 1 && record.playoffSeed <= 7;
      return <div className={`race-team ${patriots ? "race-team--patriots" : ""} ${playoff ? "race-team--playoff" : ""}`} key={record.team.id}>
        <div className="race-team__heading"><strong>{record.team.name}</strong>{playoff && <span className="playoff-badge">{record.playoffSeed <= 4 ? "Division leader" : "Wild card"}</span>}</div>
        <div className="race-team__details"><span>{record.wins}-{record.losses}{record.ties ? `-${record.ties}` : ""}</span><span aria-hidden="true">·</span><span>{Math.max(0, 17 - record.gamesPlayed)} left</span><span aria-hidden="true">·</span><span>{opponentLabel(record.team.id, data.games)}</span></div>
        {patriots ? <PostseasonNumber postseason={data.postseason} /> : <Gap gap={record.gap} />}
      </div>;
    })}</div>
  </aside>;
}

function Arrow({ next }) {
  return <svg viewBox="0 0 22 22" aria-hidden="true"><polyline points={next ? "8 5 14 11 8 17" : "14 5 8 11 14 17"} /></svg>;
}

function App() {
  const [season, setSeason] = useState(null);
  const [week, setWeek] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    getSeason(controller.signal).then((value) => {
      setSeason(value);
      setWeek(value.currentWeek);
    }).catch((error) => { if (error.name !== "AbortError") setError(error.message); });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    if (!season || !week) return;
    const controller = new AbortController();
    setData(null);
    setError("");
    async function load(initial = false) {
      try {
        const guide = await getGuide(season, week, controller.signal);
        if (!controller.signal.aborted) setData(SHOW_LIVE_MOCK ? mockLiveGuide(guide) : guide);
      } catch (error) {
        if (error.name !== "AbortError" && initial) setError(error.message);
      }
    }
    load(true);
    const interval = week === season.currentWeek ? window.setInterval(() => load(), 30_000) : null;
    return () => { controller.abort(); if (interval) window.clearInterval(interval); };
  }, [season, week]);

  const selectedWeek = season?.weeks.find((entry) => Number(entry.value) === week);

  return <div className="site-shell">
    <nav className="week-bar" aria-label="Choose NFL week">
      <button type="button" disabled={!week || week === 1} onClick={() => setWeek(week - 1)} aria-label="Previous week"><Arrow /></button>
      <div><span>This week’s card</span><strong>{week ? `Week ${week}${selectedWeek ? ` · ${selectedWeek.detail}` : ""}` : "Weekly rooting guide"}</strong></div>
      <button type="button" disabled={!week || week === season?.weeks.length} onClick={() => setWeek(week + 1)} aria-label="Next week"><Arrow next /></button>
    </nav>
    {error ? <main className="state-page" role="alert"><h1>Couldn’t load the guide.</h1><p>{error}</p><button className="retry" onClick={() => { setSeason(null); setData(null); setRetry(retry + 1); }}>Try again</button></main> : !data ? <main className="state-page" aria-live="polite"><span className="loader" /><p>Reading the AFC race…</p></main> : <main>
      {data.patriotsGames.length ? data.patriotsGames.map((game) => <GameCard key={game.id} game={game} patriots teamMap={data.teamMap} rootForSide={Object.values(game.teams).find((side) => side.team.id === PATRIOTS_ID)} targetSide={Object.values(game.teams).find((side) => side.team.id !== PATRIOTS_ID)} />) : <section className="bye-week"><p className="eyebrow">New England this week</p><h2>The Pats are on a bye.</h2><p>There’s still a conference to root against.</p></section>}
      <div className="content-grid">
        <section className="guide"><div className="section-heading"><h1>Who to root for</h1></div>
          <div className="recommendations">{data.recommendations.length ? data.recommendations.map((item, index) => <GameCard key={item.game.id} {...item} teamMap={data.teamMap} rank={index + 1} magicNumberRivalId={data.postseason.kind === "magic" ? data.postseason.rival?.team.id : null} />) : <div className="empty-card"><h2>No clear rooting choices.</h2><p>No games separate the teams around New England this week.</p></div>}</div>
        </section>
        <Standings data={data} />
      </div>
    </main>}
  </div>;
}

createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);
