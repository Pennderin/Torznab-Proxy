// ══════════════════════════════════════════════════════════════════════════════
// SCRAPER TEMPLATE
// Copy this file, rename it, and fill in the functions below.
// Then register it in server.js:
//   registerScraper('yourid', require('./scrapers/yourfile'));
// ══════════════════════════════════════════════════════════════════════════════

// If the site needs FlareSolverr (Cloudflare protected), uncomment:
// var flare = require('../flaresolverr');

var SCRAPER_ID = 'template';      // unique ID, used in URL paths
var SCRAPER_NAME = 'Template';    // display name shown in Prowlarr
var BASE_URL = 'https://example.com';

// ── Parse HTML search results into result objects ────────────────────────────
// Each result must have at minimum:
//   { dataId, title, seeders, leechers, sizeBytes, category }
// Optionally: { magnetUrl, downloadUrl, guid, detailPath }

function parseSearchResults(html) {
  var results = [];
  // TODO: parse the HTML and extract torrent rows
  // Example pattern:
  //   var rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  //   for each row, extract: title, seeders, leechers, size, magnet/id
  return results;
}

// ── Search function ──────────────────────────────────────────────────────────
// Called by server.js when Prowlarr sends a search query.
// Must return an array of result objects.

async function search(query, categories) {
  if (!query || query.trim().length < 2) return [];

  var url = BASE_URL + '/search?q=' + encodeURIComponent(query);

  // For Cloudflare-protected sites, use FlareSolverr:
  //   var solution = await flare.flareGet(url);
  //   var html = solution.response || '';

  // For non-Cloudflare sites, use regular fetch:
  //   var res = await fetch(url);
  //   var html = await res.text();

  var html = ''; // TODO: fetch the page

  var results = parseSearchResults(html);

  // If magnets are directly in the HTML, set result.magnetUrl for each.
  // If magnets require on-demand resolution (like ext.to), set downloadUrl:
  //   var proxyHost = 'http://192.168.0.190:' + (process.env.PORT || 9878);
  //   results[i].downloadUrl = proxyHost + '/magnet/' + SCRAPER_ID + '?id=' + results[i].dataId;

  return results;
}

// ── On-demand magnet resolution (optional) ───────────────────────────────────
// Only needed if magnets are NOT in the search results HTML.
// Called when Prowlarr tries to grab/download a specific torrent.
// Return the magnet URL string, or null if resolution fails.

async function resolveMagnet(dataId) {
  // TODO: fetch the magnet for the given dataId
  // Return: 'magnet:?xt=urn:btih:...' or null
  return null;
}

// ── Capabilities ─────────────────────────────────────────────────────────────
// Standard Torznab capabilities XML. Adjust categories to match the site.

function getCaps() {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<caps>\n' +
    '  <server title="' + SCRAPER_NAME + ' Torznab Proxy" />\n' +
    '  <searching>\n' +
    '    <search available="yes" supportedParams="q" />\n' +
    '    <movie-search available="yes" supportedParams="q" />\n' +
    '    <tv-search available="yes" supportedParams="q" />\n' +
    '  </searching>\n' +
    '  <categories>\n' +
    '    <category id="2000" name="Movies" />\n' +
    '    <category id="5000" name="TV" />\n' +
    '    <category id="3000" name="Audio" />\n' +
    '    <category id="7000" name="Other" />\n' +
    '  </categories>\n' +
    '</caps>';
}

// ── Module exports (required interface) ──────────────────────────────────────

module.exports = {
  name: SCRAPER_NAME,
  search: search,
  resolveMagnet: resolveMagnet,  // remove this line if magnets are in HTML
  getCaps: getCaps,
};

