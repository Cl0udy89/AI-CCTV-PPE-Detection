"""
/stats routes — summary statistics for the dashboard.
"""
from fastapi import APIRouter

from core.auth import require_role
from core.incident_manager import incident_manager

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/summary", dependencies=[require_role("viewer")])
def summary():
    return incident_manager.stats_summary()


@router.get("/timeline", dependencies=[require_role("viewer")])
def timeline(days: int = 30):
    return {"timeline": incident_manager.stats_timeline(days)}


@router.get("/by_type", dependencies=[require_role("viewer")])
def by_type():
    return {"by_type": incident_manager.stats_by_type()}


@router.get("/by_zone", dependencies=[require_role("viewer")])
def by_zone():
    return {"by_zone": incident_manager.stats_by_zone()}


@router.get("/hourly", dependencies=[require_role("viewer")])
def hourly(days: int = 7):
    return {"hourly": incident_manager.stats_hourly(days)}


@router.get("/resolution", dependencies=[require_role("viewer")])
def resolution_rate():
    return incident_manager.stats_resolution_rate()


@router.get("/dashboard", dependencies=[require_role("viewer")])
def dashboard_overview():
    """All data needed for the Dashboard page in a single request."""
    from core.shift_manager import stats_by_shift
    from core.corrective_actions import stats_open
    from core.workers_manager import list_workers, get_compliance_score

    summary = incident_manager.stats_summary()
    resolution = incident_manager.stats_resolution_rate()
    timeline7 = incident_manager.stats_timeline(7)
    shift_stats = stats_by_shift(30)
    open_actions = stats_open()

    # Top 5 workers by lowest compliance (most at-risk)
    workers = list_workers()
    workers_with_score = [
        {**w, 'compliance_score': get_compliance_score(w['id'])}
        for w in workers if w.get('active', 1)
    ]
    at_risk = sorted(workers_with_score, key=lambda x: x['compliance_score'])[:5]

    return {
        "summary": summary,
        "resolution": resolution,
        "timeline7": timeline7,
        "shift_stats": shift_stats,
        "open_actions": open_actions,
        "at_risk_workers": at_risk,
    }
