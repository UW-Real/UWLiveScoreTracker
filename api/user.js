const express = require("express");

function createUserRouter({ supabase, accountDirectory }) {
  const router = express.Router();

  router.post("/signup", async (req, res) => {
    const { email, password, name } = req.body || {};
    const username = String(req.body?.username || "").trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return res.status(400).json({ error: "Username must be 3–24 letters, numbers, or underscores." });
    }
    if (!accountDirectory) {
      return res.status(503).json({ error: "Username registration needs the server Supabase key configured." });
    }
    const { data: existing, error: lookupError } = await accountDirectory.from("account_usernames").select("user_id").eq("username", username).maybeSingle();
    if (lookupError) return res.status(503).json({ error: "Username registration is not configured yet. Apply the username migration." });
    if (existing) return res.status(409).json({ error: "That username is already taken." });
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, username } },
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(201).json({
      user: data.user,
      // Supabase may return a null session until the user confirms their email.
      session: data.session,
    });
  });

  router.post("/signin", async (req, res) => {
    const { password } = req.body || {};
    const identifier = String(req.body?.identifier || req.body?.email || "").trim();
    let email = identifier;
    if (!identifier.includes("@")) {
      if (!accountDirectory) return res.status(503).json({ error: "Username sign-in is not configured yet. Use your email." });
      const { data, error } = await accountDirectory.from("account_usernames").select("email").eq("username", identifier.toLowerCase()).maybeSingle();
      if (error) return res.status(503).json({ error: "Username sign-in is not configured yet. Use your email." });
      if (!data) return res.status(401).json({ error: "Invalid username or password." });
      email = data.email;
    }
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return res.status(401).json({ error: error.message });
    }

    return res.status(200).json({ user: data.user, session: data.session });
  });

  return router;
}

module.exports = { createUserRouter };
