// Parses ?from=&to= (YYYY-MM-DD or ISO) into a MongoDB range. A bare `to` date includes that whole day (UTC).
function dateRange(query = {}) {
  const range = {};
  if (query.from && !Number.isNaN(Date.parse(query.from))) range.$gte = new Date(query.from);
  if (query.to && !Number.isNaN(Date.parse(query.to))) {
    const to = new Date(query.to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) to.setUTCHours(23, 59, 59, 999);
    range.$lte = to;
  }
  return Object.keys(range).length ? range : null;
}

module.exports = { dateRange };
