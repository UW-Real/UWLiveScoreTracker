function espnEvent() {
  return {
    id: "401858516", date: "2026-11-07T20:30:00Z",
    competitions: [{
      date: "2026-11-07T20:30:00Z", timeValid: true,
      status: { period: 1, displayClock: "15:00", type: {
        state: "pre", name: "STATUS_SCHEDULED", completed: false, detail: "Scheduled",
      } },
      competitors: [
        { team: { id: "213", displayName: "Penn State Nittany Lions" }, homeAway: "away" },
        { team: { id: "264", displayName: "Washington Huskies" }, homeAway: "home" },
      ],
    }],
  };
}

function observation(overrides = {}) {
  return {
    event_id: "401858516", season: 2026, kickoff: "2026-11-07T20:30:00.000Z",
    start_time_tbd: false, opponent_id: "213", opponent_name: "Penn State Nittany Lions",
    home_away: "home", uw_score: null, opponent_score: null, state: "pre",
    status: "STATUS_SCHEDULED", status_detail: "Scheduled", completed: false,
    period: null, clock: null, observed_at: "2026-11-07T20:15:00.000Z", ...overrides,
  };
}

module.exports = { espnEvent, observation };
