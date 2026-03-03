var express = require('express');
var crypto = require('crypto');
var flare = require('./flaresolverr');

var app = express();
var PORT = process.env.PORT || 9878;
var API_KEY = process.env.API_KEY || 'torznab-proxy-key';

// ── Scraper Registry ─────────────────────────────────────────────────────────
// Each scraper module must export: { search(query, categories), getCaps(), name }
// Optionally: { resolveMagnet(id, title) } for on-demand magnet resolution

var scrapers = {};

function registerScraper(id, scraperModule) {
  scrapers[id] = scraperModule;
  console.log('  Registered scraper: ' + id + ' (' + scraperModule.name + ')');
}

// Load scrapers
registerScraper('extto', require('./scrapers/extto'));
// registerScraper('newsite', require('./scrapers/newsite'));  // <-- add future scrapers here

// ── XML Helpers ──────────────────────────────────────────────────────────────

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function guessCategoryId(result) {
  var cat = (result.category || '').toLowerCase();
  var title = (result.title || '').toLowerCase();
  if (cat.includes('movie') || cat.includes('film')) return 2000;
  if (cat.includes('tv') || cat.includes('television') || cat.includes('episode')) return 5000;
  if (cat.includes('audio') || cat.includes('music')) return 3000;
  if (cat.includes('game')) return 1000;
  if (cat.includes('app') || cat.includes('software')) return 4000;
  if (/s\d{2}e\d{2}/i.test(title) || /season/i.test(title)) return 5000;
  return 2000;
}

function buildTorznabXml(scraperName, results) {
  var items = results.map(function(r) {
    var catId = guessCategoryId(r);
    var dlUrl = r.downloadUrl || r.magnetUrl || '';
    return '    <item>\n' +
      '      <title>' + escapeXml(r.title) + '</title>\n' +
      '      <guid>' + escapeXml(r.guid || ('ext-' + r.dataId)) + '</guid>\n' +
      '      <pubDate>' + new Date().toUTCString() + '</pubDate>\n' +
      '      <link>' + escapeXml(dlUrl) + '</link>\n' +
      '      <size>' + (r.sizeBytes || 0) + '</size>\n' +
      '      <enclosure url="' + escapeXml(dlUrl) + '" length="' + (r.sizeBytes || 0) + '" type="application/x-bittorrent" />\n' +
      '      <torznab:attr name="seeders" value="' + (r.seeders || 0) + '" />\n' +
      '      <torznab:attr name="peers" value="' + ((r.seeders || 0) + (r.leechers || 0)) + '" />\n' +
      '      <torznab:attr name="category" value="' + catId + '" />\n' +
      '      <torznab:attr name="downloadvolumefactor" value="0" />\n' +
      '      <torznab:attr name="uploadvolumefactor" value="1" />\n' +
      '    </item>';
  }).join('\n');

  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:torznab="http://torznab.com/schemas/2015/feed">\n' +
    '  <channel>\n' +
    '    <title>' + escapeXml(scraperName) + ' via Torznab Proxy</title>\n' +
    items + '\n' +
    '  </channel>\n</rss>';
}

function testResult(scraperName) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:torznab="http://torznab.com/schemas/2015/feed">\n' +
    '  <channel>\n' +
    '    <title>' + escapeXml(scraperName) + ' via Torznab Proxy</title>\n' +
    '    <item>\n' +
    '      <title>Test Result</title>\n' +
    '      <guid>test-1</guid>\n' +
    '      <pubDate>' + new Date().toUTCString() + '</pubDate>\n' +
    '      <size>1073741824</size>\n' +
    '      <enclosure url="magnet:?xt=urn:btih:0000000000000000000000000000000000000000" length="1073741824" type="application/x-bittorrent" />\n' +
    '      <torznab:attr name="seeders" value="1" />\n' +
    '      <torznab:attr name="peers" value="2" />\n' +
    '      <torznab:attr name="category" value="2000" />\n' +
    '    </item>\n' +
    '  </channel>\n</rss>';
}

// ── Torznab API per scraper: /api/:scraperId ─────────────────────────────────

app.get('/api/:scraperId', async function(req, res) {
  var scraperId = req.params.scraperId;
  var scraper = scrapers[scraperId];

  if (!scraper) {
    return res.status(404).set('Content-Type', 'application/xml')
      .send('<?xml version="1.0" encoding="UTF-8"?><error code="100" description="Unknown scraper: ' + escapeXml(scraperId) + '"/>');
  }

  var t = req.query.t;
  var apikey = req.query.apikey;
  var q = req.query.q;
  var cat = req.query.cat;
  var limit = req.query.limit;

  if (apikey !== API_KEY) {
    return res.status(401).set('Content-Type', 'application/xml')
      .send('<?xml version="1.0" encoding="UTF-8"?><error code="100" description="Incorrect API Key"/>');
  }

  try {
    if (t === 'caps') {
      return res.set('Content-Type', 'application/xml').send(scraper.getCaps());
    }

    if (t === 'search' || t === 'movie' || t === 'tvsearch') {
      if (!q) return res.set('Content-Type', 'application/xml').send(testResult(scraper.name));
      var maxResults = parseInt(limit) || 100;
      console.log('[' + new Date().toISOString() + '] [' + scraperId + '] Search: q="' + q + '" cat=' + (cat || 'all') + ' t=' + t);
      var results = await scraper.search(q, cat ? cat.split(',').map(Number) : []);
      return res.set('Content-Type', 'application/xml').send(buildTorznabXml(scraper.name, results.slice(0, maxResults)));
    }

    return res.set('Content-Type', 'application/xml')
      .send('<?xml version="1.0" encoding="UTF-8"?><error code="201" description="Function not available"/>');
  } catch (e) {
    console.error('[error] [' + scraperId + '] ' + t + ': ' + e.message);
    return res.status(500).set('Content-Type', 'application/xml')
      .send('<?xml version="1.0" encoding="UTF-8"?><error code="900" description="' + escapeXml(e.message) + '"/>');
  }
});

// ── On-demand magnet resolution: /magnet/:scraperId ──────────────────────────

app.get('/magnet/:scraperId', async function(req, res) {
  var scraperId = req.params.scraperId;
  var scraper = scrapers[scraperId];

  if (!scraper || !scraper.resolveMagnet) {
    return res.status(404).send('Scraper not found or does not support magnet resolution');
  }

  var dataId = req.query.id;
  var title = req.query.title || '';
  if (!dataId) return res.status(400).send('Missing id');

  console.log('[magnet] [' + scraperId + '] Resolving id=' + dataId + ' "' + decodeURIComponent(title) + '"');

  try {
    var magnetUrl = await scraper.resolveMagnet(dataId);

    if (magnetUrl) {
      console.log('[magnet] [' + scraperId + '] Resolved: ' + magnetUrl.substring(0, 80) + '...');
      return res.redirect(magnetUrl);
    }
    console.log('[magnet] [' + scraperId + '] Failed - no magnet in response');
    return res.status(404).send('Could not resolve magnet');
  } catch (e) {
    console.error('[magnet] [' + scraperId + '] Error: ' + e.message);
    return res.status(500).send('Error: ' + e.message);
  }
});

// ── Index: list all registered scrapers ──────────────────────────────────────

app.get('/', function(req, res) {
  var list = Object.keys(scrapers).map(function(id) {
    return {
      id: id,
      name: scrapers[id].name,
      apiUrl: 'http://192.168.0.190:' + PORT + '/api/' + id,
      apiKey: API_KEY,
    };
  });
  res.json({ scrapers: list });
});

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/health', function(req, res) {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    scrapers: Object.keys(scrapers),
  });
});

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', function() {
  console.log('Torznab Proxy listening on port ' + PORT);
  console.log('  FlareSolverr: ' + (process.env.FLARESOLVERR_URL || 'http://localhost:8191/v1'));
  console.log('  API Key: ' + API_KEY);
  console.log('');
  Object.keys(scrapers).forEach(function(id) {
    console.log('  ' + scrapers[id].name + ':');
    console.log('    Prowlarr URL: http://192.168.0.190:' + PORT);
    console.log('    API Path: /api/' + id);
    console.log('    API Key: ' + API_KEY);
    console.log('');
  });
});

