"""Shared pytest config for backend tests.

We pin the asyncio event loop to session scope so that Motor's async
MongoDB client (created once at import time in ``core.database``) stays
bound to a live loop across every test in the run — otherwise the
second test hits ``RuntimeError: Event loop is closed``.
"""
import pytest


def pytest_collection_modifyitems(config, items):
    """Force every async test to share the session-scoped event loop."""
    for item in items:
        for marker in item.iter_markers(name="asyncio"):
            if not marker.kwargs.get("loop_scope"):
                marker.kwargs["loop_scope"] = "session"
