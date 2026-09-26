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

function showStatus(msg, ms = 3200) {
  const el = $("statusBar");
  if (!msg) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = msg;
  if (ms) setTimeout(() => {
    if (el.textContent === msg) el.hidden = true;
  }, ms);
}

function extractTweetId(input) {
  const s = (input || "").trim();
  const m = s.match(/(?:status|statuses)\/(\d{5,})/);
  if (m) return m[1];
  if (/^\d{5,}$/.test(s)) return s;
  return null;
}
function extractHandle(input) {
  const s = (input || "").trim();
  const m = s.match(/^@?([A-Za-z0-9_]{1,15})$/);
  return m ? m[1] : null;
}

async function apiGet(path) {
  try {
    const r = await fetch(path);
    if (r.ok) return r.json();
  } catch (_) {}
  const idMatch = path.match(/\/tweet\/(\d+)/);
  if (idMatch) {
    const r = await fetch(
      `https://corsproxy.io/?${encodeURIComponent("https://api.fxtwitter.com/status/" + idMatch[1])}`
    );
    const data = await r.json();
    if (data && data.tweet) return normalizeClientTweet(data.tweet);
    throw new Error(data?.message || "Khong lay duoc tweet");
  }
  const userMatch = path.match(/\/user\/([^/?]+)/);
  if (userMatch) {
    const r = await fetch(
      `https://corsproxy.io/?${encodeURIComponent("https://api.fxtwitter.com/" + userMatch[1])}`
    );
    const data = await r.json();
    if (data && data.user) return normalizeClientUser(data.user);
  }
  throw new Error("API khong phan hoi");
}

function normalizeClientUser(u) {
  return {
    id: String(u.id || ""),
    name: u.name || "",
    handle: u.screen_name || "",
    bio: u.description || "",
    avatar: u.avatar_url || "",
    followers: u.followers || 0,
    url: u.url || `https://x.com/${u.screen_name}`,
  };
}
function normalizeClientTweet(t) {
  const author = t.author || {};
  const media = [];
  const raw = t.media;
  if (Array.isArray(raw)) {
    raw.forEach((m) => {
      if (typeof m === "string") media.push({ type: "photo", url: m });
      else if (m && m.url) media.push({ type: m.type || "photo", url: m.url });
    });
  } else if (raw && typeof raw === "object") {
    (raw.photos || []).forEach((p) => media.push({ type: "photo", url: p.url || p }));
    (raw.videos || []).forEach((v) =>
      media.push({ type: "video", url: v.thumbnail_url || v.url || "" })
    );
  }
  return {
    id: String(t.id || ""),
    url: t.url || `https://x.com/i/status/${t.id}`,
    text: t.text || "",
    createdAt: t.created_at || "",
    likes: t.likes || 0,
    reposts: t.retweets || 0,
    replies: t.replies || 0,
    views: t.views || 0,
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
  state.tweets = [tweet, ...state.tweets.filter((t) => t.id !== tweet.id)];
  save();
}

function formatTime(value) {
  if (!value) return "";
  const d = isNaN(Number(value)) ? new Date(value) : new Date(Number(value) * (String(value).length < 13 ? 1000 : 1));
  if (Number.isNaN(d.getTime())) return String(value);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "vua xong";
  if (diff < 3600) return `${Math.floor(diff / 60)}p`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function nfmt(n) {
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
    .filter((w) => w.length > 1);
  const name =
    words.slice(0, 3).join(" ").slice(0, 28) ||
    (tweet.author?.name ? `${tweet.author.name} Coin` : "Tweet Token");
  let symbol = dollar ? dollar[1] : "";
  if (!symbol) {
    const caps = words.filter((w) => /^[A-Z0-9]{2,6}$/.test(w));
    symbol = (caps[0] || words.map((w) => w[0]).join("").replace(/[^A-Za-z0-9]/g, "")).slice(0, 8);
  }
  symbol = (symbol || "TWEET").toUpperCase();
  return { name, symbol, desc: text.slice(0, 280) };
}

function tweetHTML(t, { big = false } = {}) {
  const media = (t.media || [])
    .filter((m) => m.url)
    .slice(0, 4)
    .map((m) => `<img src="${esc(m.url)}" alt="" />`)
    .join("");
  return `
    <div class="meta">
      <img class="avatar" src="${esc(t.author?.avatar || "")}" alt="" onerror="this.style.opacity=.2" />
      <div class="who">
        <b>${esc(t.author?.name || "Unknown")}</b>
        <span>@${esc(t.author?.handle || "")}</span>
      </div>
      <div class="when">${esc(formatTime(t.createdAt))}</div>
    </div>
    <div class="text">${esc(t.text || "")}</div>
    ${media ? `<div class="media">${media}</div>` : ""}
    <div class="stats">
      <span>\u2665 ${nfmt(t.likes)}</span>
      <span>\u21bb ${nfmt(t.reposts)}</span>
      <span>\ud83d\udcac ${nfmt(t.replies)}</span>
    </div>
    ${big ? "" : `<div class="cta-row"><button class="btn primary" data-deploy="${t.id}">Deploy token</button></div>`}
  `;
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderFeed() {
  const feed = $("feed");
  $("emptyState").hidden = state.tweets.length > 0;
  feed.innerHTML = state.tweets
    .map((t) => `<article class="tweet-card" data-open="${t.id}">${tweetHTML(t)}</article>`)
    .join("");
  feed.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      openDeploy(el.getAttribute("data-open"));
    });
  });
}

function renderChips() {
  $("followChips").innerHTML = state.follows
    .map((h) => `<span class="chip" data-h="${esc(h)}">@${esc(h)} <span class="x" data-un="${esc(h)}">\u00d7</span></span>`)
    .join("");
  $("followChips").querySelectorAll("[data-un]").forEach((x) => {
    x.addEventListener("click", (e) => {
      e.stopPropagation();
      unfollow(x.getAttribute("data-un"));
    });
  });
}

function renderFollowList() {
  const ul = $("followList");
  ul.innerHTML = state.follows
    .map((h) => `
      <li>
        <div class="grow">
          <b>@${esc(h)}</b>
          <small>Profile cong khai</small>
        </div>
        <a class="btn ghost" href="https://x.com/${esc(h)}" target="_blank" rel="noopener">X</a>
        <button class="btn danger ghost" data-un="${esc(h)}">Bo</button>
      </li>`)
    .join("");
  ul.querySelectorAll("[data-un]").forEach((b) =>
    b.addEventListener("click", () => unfollow(b.getAttribute("data-un")))
  );
}

function setView(name) {
  state.view = name;
  ["feed", "following", "deploy"].forEach((v) => {
    $(`view-${v}`).hidden = v !== name;
  });
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
  });
}

function openDeploy(id) {
  const tweet = state.tweets.find((t) => t.id === id);
  if (!tweet) return;
  state.current = tweet;
  $("deployTweet").innerHTML = tweetHTML(tweet, { big: true });
  const sug = suggestToken(tweet);
  $("tokName").value = sug.name;
  $("tokSymbol").value = sug.symbol;
  $("tokDesc").value = sug.desc;
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
    showStatus("Dang lay tweet...");
    try {
      const tweet = await fetchTweet(id);
      upsertTweet(tweet);
      renderFeed();
      showStatus(`Da nap tweet cua @${tweet.author.handle}`);
    } catch (e) {
      showStatus(e.message || "Loi lay tweet");
    }
    return;
  }
  if (handle) {
    await follow(handle);
    return;
  }
  showStatus("Khong nhan ra URL / @handle / tweet ID.");
}

async function follow(handle) {
  handle = handle.replace(/^@/, "");
  if (!state.follows.includes(handle)) {
    state.follows.unshift(handle);
    save();
  }
  renderChips();
  renderFollowList();
  showStatus(`Da theo doi @${handle}. Dan URL tweet de nap vao feed.`);
}

function unfollow(handle) {
  state.follows = state.follows.filter((h) => h.toLowerCase() !== handle.toLowerCase());
  save();
  renderChips();
  renderFollowList();
}

async function seedIfEmpty() {
  if (state.tweets.length) return;
  for (const id of SEED_IDS) {
    try {
      const t = await fetchTweet(id);
      upsertTweet(t);
    } catch (_) {}
  }
  renderFeed();
}

async function refreshKnown() {
  const ids = state.tweets.slice(0, 8).map((t) => t.id);
  let n = 0;
  for (const id of ids) {
    try {
      const t = await fetchTweet(id);
      upsertTweet(t);
      n++;
    } catch (_) {}
  }
  renderFeed();
  if (n) showStatus(`Da lam moi ${n} tweet`);
}

function copyBotCommand() {
  const t = state.current;
  if (!t) return;
  const symbol = $("tokSymbol").value.toUpperCase() || "TICKER";
  const name = $("tokName").value || "Token";
  const text = `@FlaprBot launch ${symbol} "${name}"\n${t.url}`;
  navigator.clipboard.writeText(text).then(
    () => showStatus("Da copy lenh. Dan vao X va mention bot."),
    () => showStatus(text, 8000)
  );
}

function bind() {
  $("ingestForm").addEventListener("submit", (e) => {
    e.preventDefault();
    ingest($("ingestInput").value);
    $("ingestInput").value = "";
  });
  $("followForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const parts = $("followInput").value.split(/[\s,]+/).filter(Boolean);
    parts.forEach(follow);
    $("followInput").value = "";
  });
  document.querySelectorAll(".nav-btn").forEach((b) =>
    b.addEventListener("click", () => setView(b.dataset.view))
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
