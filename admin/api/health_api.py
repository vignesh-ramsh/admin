"""Health dashboard — a thin passthrough onto arc.health.check(), which
already aggregates every registered capability's own health() (docs/arc.MD
§3.10). No new logic; admin just makes it HTTP-reachable and gated."""

import arc


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def admin_health() -> dict:
    return await arc.health.check()
