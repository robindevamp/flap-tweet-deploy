"""Vercel Python entrypoint. Serves the static FlapTweet app and proxies tweet APIs."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path

from flask import Flask, Response, jsonify, send_from_directory

ROOT = Path(__file__).resolve().parent
FX_BASES = ("https://api.fxtwitter.com", "https://api.vxtwitter.com")

app = Flask(__name__)


def fetch_json(url: str, timeout: int = 12):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "FlapTweetDeploy/1.0",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(raw)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            return exc.code, json.loads(raw)
        except Exception:
            return exc.code, {"error": raw}
    except Exception as exc:
        return 502, {"error": str(exc)}


def normalize_tweet(tweet: dict) -> dict:
    author = tweet.get("author") or {}
    media = []
    raw = tweet.get("media")
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, str):
                media.append({"type": "photo", "url": item})
            elif isinstance(item, dict):
                media.append(
                    {
                        "type": item.get("type") or "photo",
                        "url": item.get("url") or item.get("thumbnail_url") or "",
                    }
                )
    elif isinstance(raw, dict):
        for photo in raw.get("photos") or []:
            media.append({"type": "photo", "url": photo.get("url") if isinstance(photo, dict) else photo})
        for video in raw.get("videos") or []:
            if isinstance(video, dict):
                media.append(
                    {
                        "type": "video",
                        "url": video.get("thumbnail_url") or video.get("url") or "",
                    }
                )
    seen = set()
    unique = []
    for item in media:
        url = item.get("url")
        if url and url not in seen:
            seen.add(url)
            unique.append(item)
    return {
        "id": str(tweet.get("id") or ""),
        "url": tweet.get("url") or f"https://x.com/i/status/{tweet.get('id')}",
        "text": tweet.get("text") or tweet.get("raw_text") or "",
        "createdAt": tweet.get("created_at") or tweet.get("created_timestamp") or "",
        "likes": tweet.get("likes") or tweet.get("like_count") or 0,
        "reposts": tweet.get("retweets") or tweet.get("retweet_count") or 0,
        "replies": tweet.get("replies") or tweet.get("reply_count") or 0,
        "views": tweet.get("views") or 0,
        "author": {
            "name": author.get("name") or "",
            "handle": author.get("screen_name") or "",
            "avatar": author.get("avatar_url") or "",
            "verified": bool((author.get("verification") or {}).get("verified"))
            if isinstance(author.get("verification"), dict)
            else bool(author.get("verified")),
        },
        "media": unique,
    }


def normalize_user(user: dict) -> dict:
    return {
        "id": str(user.get("id") or ""),
        "name": user.get("name") or "",
        "handle": user.get("screen_name") or "",
        "bio": user.get("description") or "",
        "avatar": user.get("avatar_url") or "",
        "followers": user.get("followers") or 0,
        "url": user.get("url") or f"https://x.com/{user.get('screen_name', '')}",
    }


@app.get("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "app": "flap-tweet-deploy"})


@app.get("/api/tweet/<tweet_id>")
def api_tweet(tweet_id: str):
    last = None
    for base in FX_BASES:
        status, data = fetch_json(f"{base}/status/{tweet_id}")
        if status == 200 and isinstance(data, dict) and data.get("tweet"):
            return jsonify(normalize_tweet(data["tweet"]))
        last = data
    return jsonify({"error": "Could not load tweet", "detail": last}), 404


@app.get("/api/user/<handle>")
def api_user(handle: str):
    handle = handle.lstrip("@")
    last = None
    for base in FX_BASES:
        status, data = fetch_json(f"{base}/{handle}")
        if status == 200 and isinstance(data, dict) and data.get("user"):
            return jsonify(normalize_user(data["user"]))
        last = data
    return jsonify({"error": "Could not load user", "detail": last}), 404


@app.get("/<path:filename>")
def static_file(filename: str):
    target = ROOT / filename
    if target.is_file():
        return send_from_directory(ROOT, filename)
    return send_from_directory(ROOT, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8787)))
