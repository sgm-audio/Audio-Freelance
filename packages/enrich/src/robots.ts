/** Minimal robots.txt allow check, matching the ingest source behavior. */
export function robotsAllows(
  robotsTxt: string,
  path: string,
  ua = "*",
): boolean {
  const lines = robotsTxt.split(/\r?\n/).map((line) => line.trim());
  let applies = false;
  let allowed = true;
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const uaMatch = line.match(/^user-agent:\s*(.+)$/i);
    if (uaMatch) {
      const agent = uaMatch[1]?.trim() ?? "";
      applies = agent === "*" || agent.toLowerCase() === ua.toLowerCase();
      continue;
    }
    if (!applies) continue;
    const disallow = line.match(/^disallow:\s*(.*)$/i);
    if (disallow) {
      const rule = disallow[1]?.trim() ?? "";
      if (rule && path.startsWith(rule)) allowed = false;
    }
    const allow = line.match(/^allow:\s*(.*)$/i);
    if (allow) {
      const rule = allow[1]?.trim() ?? "";
      if (rule && path.startsWith(rule)) allowed = true;
    }
  }
  return allowed;
}
