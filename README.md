# FlapTweet

Web app: dán tweet X bất kỳ → gợi ý token → mở [flap.sh](https://flap.sh) để launch.

Repo: https://github.com/robindevamp/flap-tweet-deploy

## Deploy Vercel (1 phút)

1. Vào https://vercel.com/new
2. Import GitHub repo `robindevamp/flap-tweet-deploy`
3. Framework preset: **Other**
4. Deploy — không cần build command.

Hoặc CLI:

```bash
npx vercel --yes
```

Trên Vercel app chạy static + fallback corsproxy để lấy tweet.

## Chạy local (proxy tốt hơn)

```bash
python3 server.py
```

Mở http://127.0.0.1:8787
