# FlapTweet

Web app: paste any public X post → suggest a token → open [flap.sh](https://flap.sh) to launch.

Repo: https://github.com/robindevamp/flap-tweet-deploy

## Deploy on Vercel (~1 minute)

1. Open https://vercel.com/new
2. Import `robindevamp/flap-tweet-deploy`
3. Framework preset: **Other**
4. Deploy — no build command needed

Or:

```bash
npx vercel --yes
```

On Vercel the site is static and loads tweets through a CORS proxy.

## Run locally (better proxy)

```bash
python3 server.py
```

Then open http://127.0.0.1:8787

`server.py` serves the static files and proxies `api.fxtwitter.com` so the browser is not blocked by CORS.

## How to use

1. Paste a tweet URL (`https://x.com/user/status/...`) or tweet ID.
2. Add `@handle`s on the **Following** tab (saved in the browser).
3. Click a tweet / **Launch token**.
4. Name, ticker, and description are suggested from the post.
5. Open flap.sh:
   - Tax token → https://flap.sh/launch
   - Non-tax → https://flap.sh/create
6. Or copy a mention command for `@FlaprBot`.

## Limits

X does not offer a free home-timeline API. This app cannot stream every post from every account you follow the way the official X app does, unless you add an API key or session cookie.

What it can do:

- Load any public tweet by URL
- Remember handles you care about
- Refresh already-loaded tweets every 25 seconds

On-chain creation still happens in your wallet on flap.sh.

## Stack

Plain HTML / CSS / JS plus a Python stdlib HTTP server. No npm required.
