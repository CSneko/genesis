"""AT-SPI permission and token failures using fixture-owned accessible objects."""
import json
import pathlib
import sys
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(pathlib.Path(__file__).parents[1] / "assets"))
from accessibility import Accessibility, Atspi
from portal import Refusal


class AccessibilityTests(unittest.TestCase):
    def setUp(self):
        self.backend = Accessibility({"accessibilityTimeoutMs": 1000}, Refusal)
        self.node = Mock()
        self.node.get_process_id.return_value = 11
        self.backend.fingerprint = lambda _pid: ("start", "/test/app")
        self.backend.applications["app"] = {"node": self.node, "pid": 11, "identity": ("start", "/test/app"),
                                            "name": "Fixture", "permission": "not-granted"}
        self.backend.begin()

    def test_result_budget_counts_multibyte_text_and_wrappers(self):
        value = {"text": "鲸鲸"}
        wrapped = {"content": [{"type": "text", "text": json.dumps(value, ensure_ascii=False)}]}
        size = len(json.dumps(wrapped, ensure_ascii=False).encode("utf-8"))
        self.backend.config.update({"accessibilityResultBytes": size, "maxResponseBytes": 4096})
        self.assertTrue(self.backend.fits(value))
        self.backend.config["accessibilityResultBytes"] = size - 1
        self.assertFalse(self.backend.fits(value))

    def test_application_contents_require_explicit_consent(self):
        with self.assertRaises(Refusal) as error:
            self.backend.application("app")
        self.assertEqual(error.exception.code, "application-consent-required")
        self.node.get_child_count.assert_not_called()
        self.backend.authorize("app", True)
        self.assertEqual(self.backend.application("app")["permission"], "granted")

    def test_process_replacement_cannot_inherit_consent(self):
        self.backend.authorize("app", True)
        self.backend.fingerprint = lambda _pid: ("different-start", "/test/app")
        with self.assertRaises(Refusal) as error:
            self.backend.application("app")
        self.assertEqual(error.exception.code, "application-stale")
        self.assertNotIn("app", self.backend.applications)

    def test_stale_element_does_not_dispatch(self):
        self.backend.snapshot_id = "fresh"
        with self.assertRaises(Refusal) as error:
            self.backend.act({"action": "activate", "snapshotId": "old", "elementId": "element", "operation": "click"})
        self.assertEqual(error.exception.code, "element-stale")
        self.node.get_action_iface.assert_not_called()

    def test_password_controls_cannot_be_changed(self):
        self.backend.authorize("app", True)
        self.backend.snapshot_id = "fresh"
        self.backend.elements["element"] = {"node": self.node, "appId": "app", "role": "password text", "name": "[protected]"}
        self.node.get_state_set.return_value.contains.return_value = False
        self.node.get_role.return_value = Atspi.Role.PASSWORD_TEXT
        with self.assertRaises(Refusal) as error:
            self.backend.act({"action": "set_text", "snapshotId": "fresh", "elementId": "element", "text": "blocked"})
        self.assertEqual(error.exception.code, "element-unavailable")
        self.node.get_editable_text_iface.assert_not_called()


if __name__ == "__main__":
    unittest.main()
