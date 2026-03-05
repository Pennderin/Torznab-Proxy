var crypto = require('crypto');
var flare = require('../flaresolverr');
var flareGet = flare.flareGet;
var flarePost = flare.flarePost;

var SCRAPER_ID = 'extto';
var SCRAPER_NAME = 'ext.to';
var BASE_URL = 'https://ext.to';

function stripHtml(str) {
  return str.replace(/<[^>]+>/g, '').trim();
}

function parseSearchResults(html) {
  var results = [];
  var rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row.includes('<th') || row.includes('TORRENT NAME')) continue;
    var idMatch = row.match(/data-id="(\d+)"/);
    if (!idMatch) continue;

    var titleMatch = row.match(/class="torrent-title-link"[^>]*>([\s\S]*?)<\/a>/);
    var title = titleMatch ? stripHtml(titleMatch[1]) : '';
    if (!title) continue;

    var detailMatch = row.match(/href="(\/[^"]*\d+\/)"/);
    var seedMatch = row.match(/class="text-success"[^>]*>(\d+)/);
    var leechMatch = row.match(/class="text-danger"[^>]*>(\d+)/);
    var sizeBytes = 0;
    var sizeMatch = row.match(/([\d.]+)\s*(GB|MB|KB|TB)/i);
    if (sizeMatch) {
      var num = parseFloat(sizeMatch[1]);
      var unit = sizeMatch[2].toUpperCase();
      var mult = { KB: 1024, MB: Math.pow(1024, 2), GB: Math.pow(1024, 3), TB: Math.pow(1024, 4) };
      sizeBytes = Math.round(num * (mult[unit] || 0));
    }
    var catMatch = row.match(/Posted in\s+([^<\n-]+)/);
    var category = catMatch ? catMatch[1].trim().toLowerCase() : '';
    results.push({
      dataId: idMatch[1],
      guid: SCRAPER_ID + '-' + idMatch[1],
      title: title,
      detailPath: detailMatch ? detailMatch[1] : null,
      seeders: seedMatch ? parseInt(seedMatch[1]) : 0,
      leechers: leechMatch ? parseInt(leechMatch[1]) : 0,
      sizeBytes: sizeBytes,
      category: category,
    });
  }
  return results;
}

// ── Search ───────────────────────────────────────────────────────────────────

async function search(query, categories) {
  if (!query || query.trim().length < 2) return [];
  var url = BASE_URL + '/browse/?q=' + encodeURIComponent(query) + '&sort=seeders&order=desc';
  console.log('[' + SCRAPER_ID + '] Searching: ' + url);
  var t0 = Date.now();
  var solution = await flareGet(url);
  var html = solution.response || '';
  console.log('[' + SCRAPER_ID + '] Page fetched in ' + (Date.now() - t0) + 'ms (' + html.length + ' bytes)');
  var results = parseSearchResults(html);
  console.log('[' + SCRAPER_ID + '] Parsed ' + results.length + ' results');

  var proxyHost = 'http://' + (process.env.PROXY_HOST || 'localhost') + ':' + (process.env.PORT || 9878);
  for (var i = 0; i < results.length; i++) {
    results[i].downloadUrl = proxyHost + '/magnet/' + SCRAPER_ID + '?id=' + results[i].dataId + '&title=' + encodeURIComponent(results[i].title);
  }

  return results;
}

// ── On-demand magnet resolution ──────────────────────────────────────────────

function makeSlug(title) {
  return title.replace(/\./g, '-').replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

async function resolveMagnet(dataId, title) {
  var sessionId = SCRAPER_ID + '_grab_' + dataId + '_' + Date.now();
  try {
    await flare.createSession(sessionId);

    // Construct the detail page URL: /{slug}-{id}/
    var slug = makeSlug(title || 'torrent');
    var detailUrl = BASE_URL + '/' + slug + '-' + dataId + '/';
    console.log('[' + SCRAPER_ID + '] Loading detail page: ' + detailUrl);
    var pageSolution = await flareGet(detailUrl, sessionId);
    var pageHtml = pageSolution.response || '';

    var pageTokenMatch = pageHtml.match(/pageToken\s*=\s*'([^']+)'/);
    var csrfTokenMatch = pageHtml.match(/csrfToken\s*=\s*'([^']+)'/);

    if (!pageTokenMatch || !csrfTokenMatch) {
      // Fallback: try browse page tokens (less likely to work but worth trying)
      console.log('[' + SCRAPER_ID + '] No tokens on detail page, trying browse page...');
      var browseSolution = await flareGet(BASE_URL + '/browse/?q=test', sessionId);
      var browseHtml = browseSolution.response || '';
      pageTokenMatch = browseHtml.match(/(?:pageToken|searchPageToken)\s*=\s*'([^']+)'/);
      csrfTokenMatch = browseHtml.match(/csrfToken\s*=\s*'([^']+)'/);
    }

    if (!pageTokenMatch || !csrfTokenMatch) {
      throw new Error('Could not extract tokens from ' + SCRAPER_NAME);
    }

    var timestamp = Math.floor(Date.now() / 1000);
    var hmac = crypto.createHash('sha256')
      .update(parseInt(dataId) + '|' + timestamp + '|' + pageTokenMatch[1])
      .digest('hex');
    var sessid = csrfTokenMatch[1];

    // Build cookie string from FlareSolverr session
    var cookies = pageSolution.cookies || [];
    var cookieStr = cookies.map(function(c) { return c.name + '=' + c.value; }).join('; ');
    var userAgent = pageSolution.userAgent || '';

    // Use direct fetch with XHR headers (not FlareSolverr's flarePost)
    // This mimics jQuery $.ajax which ext.to's server expects
    var magnetUrl = null;

    // Try download_type=magnet first (returns magnet URL directly)
    var postData = 'torrent_id=' + dataId + '&download_type=magnet&timestamp=' + timestamp + '&hmac=' + hmac + '&sessid=' + sessid;
    try {
      var resp = await fetch(BASE_URL + '/ajax/getTorrentMagnet.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookieStr,
          'User-Agent': userAgent,
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': detailUrl,
          'Origin': BASE_URL,
          'Accept': 'application/json, text/javascript, */*; q=0.01',
        },
        body: postData,
      });
      if (resp.ok) {
        var data = await resp.json();
        if (data.success) {
          magnetUrl = data.url || (data.hash ? 'magnet:?xt=urn:btih:' + data.hash : null);
        } else {
          console.log('[' + SCRAPER_ID + '] download_type=magnet rejected: ' + (data.error || 'unknown'));
        }
      }
    } catch (e) {
      console.log('[' + SCRAPER_ID + '] download_type=magnet error: ' + e.message);
    }

    // Fallback: try action=get_hash
    if (!magnetUrl) {
      try {
        var postData2 = 'torrent_id=' + dataId + '&action=get_hash&timestamp=' + timestamp + '&hmac=' + hmac + '&sessid=' + sessid;
        var resp2 = await fetch(BASE_URL + '/ajax/getTorrentMagnet.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookieStr,
            'User-Agent': userAgent,
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': detailUrl,
            'Origin': BASE_URL,
            'Accept': 'application/json, text/javascript, */*; q=0.01',
          },
          body: postData2,
        });
        if (resp2.ok) {
          var data2 = await resp2.json();
          if (data2.success && data2.hash) {
            magnetUrl = 'magnet:?xt=urn:btih:' + data2.hash;
          }
        }
      } catch (e2) {
        console.log('[' + SCRAPER_ID + '] get_hash error: ' + e2.message);
      }
    }

    return magnetUrl;
  } finally {
    await flare.destroySession(sessionId);
  }
}

// ── Capabilities ─────────────────────────────────────────────────────────────

function getCaps() {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<caps>\n' +
    '  <server title="' + SCRAPER_NAME + ' Torznab Proxy" />\n' +
    '  <searching>\n' +
    '    <search available="yes" supportedParams="q" />\n' +
    '    <movie-search available="yes" supportedParams="q,imdbid" />\n' +
    '    <tv-search available="yes" supportedParams="q" />\n' +
    '  </searching>\n' +
    '  <categories>\n' +
    '    <category id="2000" name="Movies">\n' +
    '      <subcat id="2030" name="Movies/SD" />\n' +
    '      <subcat id="2040" name="Movies/HD" />\n' +
    '      <subcat id="2045" name="Movies/UHD" />\n' +
    '      <subcat id="2050" name="Movies/BluRay" />\n' +
    '    </category>\n' +
    '    <category id="5000" name="TV">\n' +
    '      <subcat id="5030" name="TV/SD" />\n' +
    '      <subcat id="5040" name="TV/HD" />\n' +
    '      <subcat id="5045" name="TV/UHD" />\n' +
    '    </category>\n' +
    '    <category id="3000" name="Audio" />\n' +
    '    <category id="4000" name="PC" />\n' +
    '    <category id="7000" name="Other" />\n' +
    '  </categories>\n' +
    '</caps>';
}

module.exports = {
  name: SCRAPER_NAME,
  search: search,
  resolveMagnet: resolveMagnet,
  getCaps: getCaps,
  parseSearchResults: parseSearchResults,
};

