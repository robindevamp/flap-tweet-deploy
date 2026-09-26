const STORE_TWEETS = "flaptweet.tweets.v1";
const STORE_FOLLOWS = "flaptweet.follows.v1";

const SEED_IDS = [
  "1819363688966770920",
  "2096702102664057327",
];

const DEFAULT_FOLLOWS = ["flapdotsh", "cz_binance", "elonmusk"];

const $ = (id) => document.getElementById(id);

const state = {
  view: "feed",
  tweets: load(STORE_TWEETS, []),
  follows: load(STORE_FOLLOWS, DEFAULT_FOLLOWS),
  current: null,
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save() {
  localStorage.setItem(STORE_TWEETS, JSON.stringify(state.tweets.slice(0, 80)));
  localStorage.setItem(STORE_FOLLOWS, JSON.stringify(state.follows));
}

function showStatus(message, ms = 3200) {
  const el = $("statusBar");
  if (!message) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = message;
  if (ms) {
    setTimeout(() => {
      if (el.textContent === message) el.hidden = true;
    }, ms);
  }
}

function extractTweetId(input) {
  const value = (input || "").trim();
  const match = value.match(/(?:status|statuses)\/(\d{5,})/);
  if (match) return match[1];
  if (/^\d{5,}$/.test(value)) return value;
  return null;
}

function extractHandle(input) {
  const value = (input || "").trim();
  const match = value.match(/^@?([A-Za-z0-9_]{1,15})$/);
  return match ? match[1] : null;
}

async function apiGet(path) {
  try {
    const response = await fetch(path);
    if (response.ok) return response.json();
  } catch (_) {}

  const idMatch = path.match(/\/tweet\/(\d+)/);
  if (idMatch) {
    const response = await fetch(
      `https://corsproxy.io/?${encodeURIComponent("https://api.fxtwitter.com/status/" + idMatch[1])}`
    );
    const data = await response.json();
    if (data && data.tweet) return normalizeClientTweet(data.tweet);
    throw new Error(data?.message || "Could not load this tweet");
  }

  const userMatch = path.match(/\/user\/([^/?]+)/);
  if (userMatch) {
    const response = await fetch(
      `https://corsproxy.io/?${encodeURIComponent("https://api.fxtwitter.com/" + userMatch[1])}`
    );
    const data = await response.json();
    if (data && data.user) return normalizeClientUser(data.user);
  }

  throw new Error("API did not respond. Run python3 server.py locally for a more reliable proxy.");
}

function normalizeClientUser(user) {
  return {
    id: String(user.id || ""),
    name: user.name || "",
    handle: user.screen_name || "",
    bio: user.description || "",
    avatar: user.avatar_url || "",
    followers: user.followers || 0,
    url: user.url || `https://x.com/${user.screen_name}`,
  };
}

function normalizeClientTweet(tweet) {
  const author = tweet.author || {};
  const media = [];
  const raw = tweet.media;
  if (Array.isArray(raw)) {
    raw.forEach((item) => {
      if (typeof item === "string") media.push({ type: "photo", url: item });
      else if (item && item.url) media.push({ type: item.type || "photo", url: item.url });
    });
  } else if (raw && typeof raw === "object") {
    (raw.photos || []).forEach((photo) => media.push({ type: "photo", url: photo.url || photo }));
    (raw.videos || []).forEach((video) =>
      media.push({ type: "video", url: video.thumbnail_url || video.url || "" })
    );
  }
  return {
    id: String(tweet.id || ""),
    url: tweet.url || `https://x.com/i/status/${tweet.id}`,
    text: tweet.text || "",
    createdAt: tweet.created_at || "",
    likes: tweet.likes || 0,
    reposts: tweet.retweets || 0,
    replies: tweet.replies || 0,
    views: tweet.views || 0,
    author: {
      name: author.name || "",
      handle: author.screen_name || "",
      avatar: author.avatar_url || "",
      verified: Boolean(author.verified),
    },
    media,
    fetchedAt: Date.now(),
  };
}

async function fetchTweet(id) {
  const data = await apiGet(`/api/tweet/${id}`);
  data.fetchedAt = Date.now();
  return data;
}

function upsertTweet(tweet) {
  if (!tweet || !tweet.id) return;
  state.tweets = [tweet, ...state.tweets.filter((item) => item.id !== tweet.id)];
  save();
}

function formatTime(value) {
  if (!value) return "";
  const date = isNaN(Number(value))
    ? new Date(value)
    : new Date(Number(value) * (String(value).length < 13 ? 1000 : 1));
  if (Number.isNaN(date.getTime())) return String(value);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCount(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function suggestToken(tweet) {
  const text = tweet.text || "";
  const dollar = text.match(/\$([A-Z][A-Z0-9]{1,9})\b/);
  const words = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[@#]\w+/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1);
  const name =
    words.slice(0, 3).join(" ").slice(0, 28) ||
    (tweet.author?.name ? `${tweet.author.name} Coin` : "Tweet Token");
  let symbol = dollar ? dollar[1] : "";
  if (!symbol) {
    const caps = words.filter((word) => /^[A-Z0-9]{2,6}$/.test(word));
    symbol = (caps[0] || words.map((word) => word[0]).join("").replace(/[^A-Za-z0-9]/g, "")).slice(0, 8);
  }
  symbol = (symbol || "TWEET").toUpperCase();
  return { name, symbol, desc: text.slice(0, 280) };
}

function tweetHTML(tweet, { big = false } = {}) {
  const media = (tweet.media || [])
    .filter((item) => item.url)
    .slice(0, 4)
    .map((item) => `<img src="${esc(item.url)}" alt="" />`)
    .join("");
  return `
    <div class="meta">
      <img class="avatar" src="${esc(tweet.author?.avatar || "")}" alt="" onerror="this.style.opacity=.2" />
      <div class="who">
        <b>${esc(tweet.author?.name || "Unknown")}</b>
        <span>@${esc(tweet.author?.handle || "")}</span>
      </div>
      <div class="when">${esc(formatTime(tweet.createdAt))}</div>
    </div>
    <div class="text">${esc(tweet.text || "")}</div>
    ${media ? `<div class="media">${media}</div>` : ""}
    <div class="stats">
      <span>♥ ${formatCount(tweet.likes)}</span>
      <span>↻ ${formatCount(tweet.reposts)}</span>
      <span>💬 ${formatCount(tweet.replies)}</span>
    </div>
    ${big ? "" : `<div class="cta-row"><button class="btn primary" data-deploy="${tweet.id}">Launch token</button></div>`}
  `;
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, """);
}

function renderFeed() {
  const feed = $("feed");
  $("emptyState").hidden = state.tweets.length > 0;
  feed.innerHTML = state.tweets
    .map((tweet) => `<article class="tweet-card" data-open="${tweet.id}">${tweetHTML(tweet)}</article>`)
    .join("");
  feed.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      openDeploy(el.getAttribute("data-open"));
    });
  });
}

function renderChips() {
  $("followChips").innerHTML = state.follows
    .map((handle) => `<span class="chip">@${esc(handle)} <span class="x" data-un="${esc(handle)}">×</span></span>`)
    .join("");
  $("followChips").querySelectorAll("[data-un]").forEach((el) => {
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      unfollow(el.getAttribute("data-un"));
    });
  });
}

function renderFollowList() {
  const list = $("followList");
  list.innerHTML = state.follows
    .map((handle) => `
      <li>
        <div class="grow">
          <b>@${esc(handle)}</b>
          <small>Public profile · add posts by URL</small>
        </div>
        <a class="btn ghost" href="https://x.com/${esc(handle)}" target="_blank" rel="noopener">X</a>
        <button class="btn danger ghost" data-un="${esc(handle)}">Unfollow</button>
      </li>`)
    .join("");
  list.querySelectorAll("[data-un]").forEach((button) =>
    button.addEventListener("click", () => unfollow(button.getAttribute("data-un")))
  );
}

function setView(name) {
  state.view = name;
  ["feed", "following", "deploy"].forEach((view) => {
    $(`view-${view}`).hidden = view !== name;
  });
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === name);
  });
}

function openDeploy(id) {
  const tweet = state.tweets.find((item) => item.id === id);
  if (!tweet) return;
  state.current = tweet;
  $("deployTweet").innerHTML = tweetHTML(tweet, { big: true });
  const suggestion = suggestToken(tweet);
  $("tokName").value = suggestion.name;
  $("tokSymbol").value = suggestion.symbol;
  $("tokDesc").value = suggestion.desc;
  $("openTweet").href = tweet.url;
  updateFlapLink();
  setView("deploy");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateFlapLink() {
  const type = $("tokType").value;
  $("openFlap").href = type === "tax" ? "https://flap.sh/launch" : "https://flap.sh/create";
}

async function ingest(raw) {
  const value = raw.trim();
  if (!value) return;
  const id = extractTweetId(value);
  const handle = extractHandle(value);
  if (id) {
    showStatus("Loading tweet…");
    try {
      const tweet = await fetchTweet(id);
      upsertTweet(tweet);
      renderFeed();
      showStatus(`Added tweet from @${tweet.author.handle}`);
    } catch (error) {
      showStatus(error.message || "Failed to load tweet");
    }
    return;
  }
  if (handle) {
    await follow(handle);
    return;
  }
  showStatus("Could not parse that as a tweet URL, tweet ID, or @handle.");
}

async function follow(handle) {
  handle = handle.replace(/^@/, "");
  if (!state.follows.includes(handle)) {
    state.follows.unshift(handle);
    save();
  }
  renderChips();
  renderFollowList();
  showStatus(`Looking up @${handle}…`);
  try {
    const user = await apiGet(`/api/user/${handle}`);
    showStatus(`Now following @${user.handle || handle}. Paste a tweet URL to add it to the feed.`);
  } catch {
    showStatus(`Saved @${handle}. Paste a tweet URL to add it to the feed.`);
  }
}

function unfollow(handle) {
  state.follows = state.follows.filter((item) => item.toLowerCase() !== handle.toLowerCase());
  save();
  renderChips();
  renderFollowList();
}

async function seedIfEmpty() {
  if (state.tweets.length) return;
  showStatus("Loading sample tweets…", 8000);
  for (const id of SEED_IDS) {
    try {
      const tweet = await fetchTweet(id);
      upsertTweet(tweet);
    } catch (_) {}
  }
  renderFeed();
  if (state.tweets.length) showStatus("Loaded sample tweets from @flapdotsh");
}

async function refreshKnown() {
  const ids = state.tweets.slice(0, 8).map((tweet) => tweet.id);
  let count = 0;
  for (const id of ids) {
    try {
      const tweet = await fetchTweet(id);
      upsertTweet(tweet);
      count++;
    } catch (_) {}
  }
  renderFeed();
  if (count) showStatus(`Refreshed ${count} tweet${count === 1 ? "" : "s"}`);
}

function copyBotCommand() {
  const tweet = state.current;
  if (!tweet) return;
  const symbol = $("tokSymbol").value.toUpperCase() || "TICKER";
  const name = $("tokName").value || "Token";
  const text = `@FlaprBot launch ${symbol} "${name}"\n${tweet.url}`;
  navigator.clipboard.writeText(text).then(
    () => showStatus("Copied. Paste it on X and mention the bot."),
    () => showStatus(text, 8000)
  );
}

function bind() {
  $("ingestForm").addEventListener("submit", (event) => {
    event.preventDefault();
    ingest($("ingestInput").value);
    $("ingestInput").value = "";
  });
  $("followForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const handles = $("followInput").value.split(/[\s,]+/).filter(Boolean);
    handles.forEach(follow);
    $("followInput").value = "";
  });
  document.querySelectorAll(".nav-btn").forEach((button) =>
    button.addEventListener("click", () => setView(button.dataset.view))
  );
  $("goHome").addEventListener("click", () => setView("feed"));
  $("backBtn").addEventListener("click", () => setView("feed"));
  $("refreshBtn").addEventListener("click", refreshKnown);
  $("clearFeedBtn").addEventListener("click", () => {
    state.tweets = [];
    save();
    renderFeed();
  });
  $("copyBot").addEventListener("click", copyBotCommand);
  $("tokType").addEventListener("change", updateFlapLink);
}

function boot() {
  bind();
  renderFeed();
  renderChips();
  renderFollowList();
  seedIfEmpty();
  setInterval(refreshKnown, 25000);
}

boot();
