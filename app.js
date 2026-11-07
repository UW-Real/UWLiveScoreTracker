const express = require("express");
const http = require("http");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const crypto = require("node:crypto");
const next = require("next");
const { createClient } = require("@supabase/supabase-js");
const { createUserRouter } = require("./api/user");

if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: ".env.development" });
}

const app = express();
const server = http.createServer(app);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in the environment before starting app.js."
  );
}

// This client only verifies caller-provided access tokens. Do not use a
// Supabase secret/service-role key here; those keys bypass Row Level Security.
const supabase = createClient(supabaseUrl, supabasePublishableKey);

const allowedOrigins = (process.env.SERVER_CORS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS", "HEAD"],
    // Supabase access tokens are sent as Bearer tokens, so cookie credentials
    // are not needed for these API requests.
    credentials: false,
  })
);

app.use(helmet.permittedCrossDomainPolicies());
app.use(helmet.referrerPolicy());
app.use(helmet.xssFilter());
app.use(helmet.hsts());
app.use(helmet.ieNoOpen());
app.use(helmet.noSniff());
app.use(helmet.dnsPrefetchControl());
app.use(helmet.frameguard({ action: "SAMEORIGIN" }));
app.use(helmet.hidePoweredBy());
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString("hex");
  res.setHeader("X-XSS-protection", "1; mode=block");
  next();
});

const cspOptions = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
    // Product imagery is served directly from the catalog's Amazon image host
    // and the local reference imagery host allowed in next.config.mjs.
    imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https://m.media-amazon.com"],
    connectSrc: ["'self'", "https:"],
    workerSrc: ["'self'", "blob:"],
  },
};

if (process.env.NODE_ENV === "production") {
  app.use(helmet.contentSecurityPolicy(cspOptions));
}

app.use(express.json());

async function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({
      success: false,
      error: { reason: "A Supabase access token is required" },
    });
  }

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(match[1]);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: { reason: "Invalid or expired access token" },
      });
    }

    // API handlers can use req.user.id as the authenticated Supabase user ID.
    req.user = user;

    // A request-scoped client forwards this user's token to Supabase Database,
    // allowing the database's Row Level Security policies to apply.
    req.supabase = createClient(supabaseUrl, supabasePublishableKey, {
      global: { headers: { Authorization: `Bearer ${match[1]}` } },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    req.catalogSupabase = accountDirectory;

    return next();
  } catch (error) {
    console.error("Supabase token verification failed:", error);
    return res.status(401).json({
      success: false,
      error: { reason: "Unable to verify access token" },
    });
  }
}

// This separate server-only client never receives a user's session.
const serverSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const accountDirectory = serverSecretKey
  ? createClient(supabaseUrl, serverSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

app.use("/auth", createUserRouter({ supabase, accountDirectory }));
app.use("/score", requireAuth, require("./api/score").Router); // protected route

app.head("/", (req, res) => res.status(200).end()); // Possible keepalive

const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();
const PORT = process.env.PORT || 5000;
const HOST = process.env.NODE_ENV === "development" ? "localhost" : undefined;

nextApp.prepare().then(() => {
  app.use((req, res) => handle(req, res));

  server.listen(PORT, HOST, () => {
    if (HOST) {
      console.log(`Server running at http://${HOST}:${PORT}`);
    } else {
      console.log(`Server running on port ${PORT}`);
    }
  });
});

module.exports = { app, server, requireAuth };
