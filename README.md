# Torznab Proxy

Torznab-compatible proxy that scrapes torrent sites and serves results via standard Torznab XML API. Designed to work with Prowlarr as a custom indexer.

## Features

- **Multi-scraper architecture** — add new sites by dropping a scraper module in `src/scrapers/`
- **FlareSolverr integration** — automatic Cloudflare bypass for protected sites
- **On-demand magnet resolution** — fetches magnets at grab time to avoid timeouts
- **Prowlarr compatible** — standard Torznab XML API with caps endpoint

## Included Scrapers

- **ext.to** — aggregator with HMAC-authenticated magnet resolution

## Docker

```bash
docker run -d \
  --name torznab-proxy \
  -p 9878:9878 \
  -e API_KEY=your-api-key \
  -e PROXY_HOST=your-nas-ip \
  -e FLARESOLVERR_URL=http://your-nas-ip:8191/v1 \
  ghcr.io/pennderin/torznab-proxy:latest
```

## Prowlarr Setup

Add as a custom indexer (Generic Torznab):
- **URL:** `http://your-nas-ip:9878/api/extto`
- **API Key:** your configured API_KEY

## Adding New Scrapers

See `src/scrapers/_template.js` for the scraper interface.
