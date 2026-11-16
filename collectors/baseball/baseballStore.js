function createBaseballStore(supabase) {
  return {
    async record(game, scheduleOnly = false) {
      const { error } = await supabase.rpc("record_baseball_observation", {
        observation: game, schedule_only: scheduleOnly,
      });
      if (error) throw new Error(`Unable to store baseball observation: ${error.message}`);
    },
    async dueGames(now) {
      const { data, error } = await supabase.from("baseball_games")
        .select("event_id, season, start_time_tbd, kickoff")
        .lte("next_poll_at", now.toISOString()).order("next_poll_at");
      if (error) throw new Error(`Unable to read collection schedule: ${error.message}`);
      return data;
    },
  };
}

module.exports = { createBaseballStore };
