# accounts/test_internal_contracts.py
"""
Test suite for Blocker 8 (Internal Service Contracts). Statically scans every
.py file in the backend for cross-app imports of a leading-underscore name
(e.g. `from payments.views import _transfer_to_vendor`) — Python's convention
for "this is a private implementation detail, do not import it from outside
this module." Blocker 8 renamed every function that was being imported this
way into a public, documented contract function (see payments/contracts.py,
delivery/contracts.py); this test is the permanent guard against the same
class of violation quietly returning later.

This is a static AST check, not a runtime behavior test — it has no
false-negative risk from mocking/patching (patch() targets are plain
strings, not real imports, so they're irrelevant to this scan) and it runs
in milliseconds against the whole tree.

Scope note: test files are excluded from this scan. A test reaching into
another app's private function to set up a fixture (e.g. simulating a
Paystack webhook by calling payments' internal webhook-processing function
directly) is a different, much lower-stakes pattern than production code
doing the same thing — it can only ever break that test, never production
behavior. This mirrors the scoping the Blocker 8 investigation itself used.
"""
import ast
from pathlib import Path

from django.test import SimpleTestCase

BACKEND_ROOT = Path(__file__).resolve().parent.parent

APPS = {
    'accounts', 'services', 'orders', 'payments', 'cart', 'wishlist',
    'chat', 'reviews', 'loyalty', 'notifications', 'delivery', 'customers',
}

# `studex` is the project's shared glue package (settings, urls, permissions,
# email) — not an "app" in the Django sense, but the same "no reaching into
# another module's private names" convention applies to it. Directory-based,
# scanned the same way as the 12 apps above.
DIRECTORY_OWNERS = APPS | {'studex'}

# Single-file top-level modules with the same expectation: scheduler.py
# orchestrates jobs across every app; groq_notifications.py is called from
# accounts/admin_views.py.
TOP_LEVEL_MODULE_OWNERS = {'scheduler', 'groq_notifications'}

ALL_OWNERS = DIRECTORY_OWNERS | TOP_LEVEL_MODULE_OWNERS

EXCLUDED_DIR_PARTS = {'migrations', '__pycache__', 'venv', 'env', 'node_modules', '.git'}


def _is_test_file(path):
    name = path.name
    return name == 'tests.py' or name.startswith('test_') or name.startswith('tests_') or name.endswith('_test.py')


def _iter_source_files(root):
    for owner in DIRECTORY_OWNERS:
        owner_dir = root / owner
        if not owner_dir.is_dir():
            continue
        for path in owner_dir.rglob('*.py'):
            if any(part in EXCLUDED_DIR_PARTS for part in path.parts):
                continue
            if _is_test_file(path):
                continue
            yield owner, path
    for module_name in TOP_LEVEL_MODULE_OWNERS:
        path = root / f'{module_name}.py'
        if path.is_file():
            yield module_name, path


def _app_of_module(module_name):
    """Returns the owning app/module a dotted import path belongs to, or None."""
    if not module_name:
        return None
    top = module_name.split('.')[0]
    return top if top in ALL_OWNERS else None


def find_private_cross_app_imports(root=BACKEND_ROOT):
    """
    Returns a list of (file_path, lineno, module, name) for every import of a
    leading-underscore name from a different app's module.
    """
    violations = []
    for owning_app, path in _iter_source_files(root):
        try:
            source = path.read_text(encoding='utf-8')
            tree = ast.parse(source, filename=str(path))
        except (SyntaxError, UnicodeDecodeError):
            continue

        for node in ast.walk(tree):
            if not isinstance(node, ast.ImportFrom):
                continue
            target_app = _app_of_module(node.module)
            if target_app is None or target_app == owning_app:
                continue  # not a cross-app import (or not one of our apps at all)
            for alias in node.names:
                if alias.name.startswith('_') and alias.name != '_':
                    violations.append((str(path.relative_to(root)), node.lineno, node.module, alias.name))
    return violations


class NoPrivateCrossAppImportsTests(SimpleTestCase):
    databases = []

    def test_no_app_imports_a_private_name_from_another_app(self):
        violations = find_private_cross_app_imports()
        if violations:
            details = "\n".join(
                f"  {path}:{lineno} imports private `{name}` from `{module}`"
                for path, lineno, module, name in violations
            )
            self.fail(
                f"Found {len(violations)} cross-app import(s) of a leading-underscore "
                f"(private) name — rename the target to a public function (see "
                f"payments/contracts.py, delivery/contracts.py for the pattern) instead "
                f"of reaching into another app's private implementation:\n{details}"
            )

    def test_scan_actually_covers_known_apps(self):
        """Sanity check that the scanner isn't silently finding zero files."""
        files = list(_iter_source_files(BACKEND_ROOT))
        self.assertGreater(len(files), 50)
        scanned_apps = {app for app, _ in files}
        self.assertIn('payments', scanned_apps)
        self.assertIn('delivery', scanned_apps)
        self.assertIn('orders', scanned_apps)

    def test_detector_catches_a_known_violation_shape(self):
        """Proves the AST scan actually works, using an in-memory fixture — not the real tree."""
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            (tmp_root / 'payments').mkdir()
            (tmp_root / 'payments' / 'views.py').write_text(
                "def _private_helper():\n    pass\n", encoding='utf-8',
            )
            (tmp_root / 'orders').mkdir()
            (tmp_root / 'orders' / 'views.py').write_text(
                "from payments.views import _private_helper\n", encoding='utf-8',
            )

            violations = find_private_cross_app_imports(root=tmp_root)

        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0][3], '_private_helper')

    def test_detector_ignores_public_and_intra_app_imports(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            (tmp_root / 'payments').mkdir()
            (tmp_root / 'payments' / 'views.py').write_text(
                "def trigger_vendor_payout():\n    pass\ndef _internal():\n    pass\n", encoding='utf-8',
            )
            (tmp_root / 'orders').mkdir()
            (tmp_root / 'orders' / 'views.py').write_text(
                "from payments.views import trigger_vendor_payout\n"
                "from .models import Order\n",
                encoding='utf-8',
            )
            (tmp_root / 'payments' / 'admin.py').write_text(
                "from payments.views import _internal\n",  # intra-app — not a violation
                encoding='utf-8',
            )

            violations = find_private_cross_app_imports(root=tmp_root)

        self.assertEqual(violations, [])
