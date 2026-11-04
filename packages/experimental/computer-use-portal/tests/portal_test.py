"""Execution refusals and coordinate mapping without desktop access."""
import importlib.util
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(pathlib.Path(__file__).parents[1] / "assets"))
spec = importlib.util.spec_from_file_location("portal", pathlib.Path(__file__).parents[1] / "assets/portal.py")
portal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(portal)
from permission_store import load_token, save_token


class InputTests(unittest.TestCase):
    def setUp(self):
        self.desktop = portal.Desktop.__new__(portal.Desktop)
        self.desktop.shared = False
        self.desktop.accessibility = None
        self.desktop.session = "/session/test"
        self.desktop.owner = "life-session"
        self.desktop.stream = 10
        self.desktop.geometry = [1920, 1080]
        self.desktop.versions = {portal.RD: 2, portal.SC: 5}
        self.desktop.devices = 3
        self.desktop.frame = {"frameId": "frame", "width": 960, "height": 540}
        self.calls = []
        self.desktop.notify = lambda *args: self.calls.append(args)

    def test_other_conversation_and_stale_frame_cannot_send_input(self):
        for owner, frame, code in [("other", "frame", "desktop-busy"), ("life-session", "old", "screenshot-required")]:
            with self.assertRaises(portal.Refusal) as error:
                self.desktop.execute(owner, {"action": "click", "frameId": frame, "x": 10, "y": 20})
            self.assertEqual(error.exception.code, code)
        self.assertEqual(self.calls, [])

    def test_semantic_inspection_requires_portal_consent_and_its_owner(self):
        self.desktop.accessibility = Mock()
        with self.assertRaises(portal.Refusal):
            self.desktop.execute("other", {"action": "apps"})
        self.desktop.session = None
        with self.assertRaises(portal.Refusal):
            self.desktop.execute("life-session", {"action": "apps"})
        self.desktop.accessibility.apps.assert_not_called()

    def test_status_does_not_report_another_conversations_grant_as_usable(self):
        status = self.desktop.status("other")
        self.assertFalse(status["connected"])
        self.assertEqual(status["permission"], "owned-by-another-conversation")
        self.assertIsNone(status["logicalSize"])

    def test_agent_release_only_closes_its_own_grant(self):
        closed = []
        self.desktop.close = lambda: closed.append(True)
        self.desktop.execute("other", {"action": "release"})
        self.assertEqual(closed, [])
        self.desktop.execute("life-session", {"action": "release"})
        self.assertEqual(closed, [True])

    def test_deployment_grant_survives_agent_release_and_accepts_another_session(self):
        self.desktop.shared = True
        self.desktop.owner = "deployment"
        self.desktop.close = Mock()
        self.desktop.execute("first", {"action": "release"})
        self.desktop.close.assert_not_called()
        self.desktop.execute("second", {"action": "key", "keys": ["Enter"]})
        self.assertEqual(len(self.calls), 2)
        self.desktop.session = None
        with self.assertRaises(portal.Refusal):
            self.desktop.execute("second", {"action": "key", "keys": ["Enter"]})
        self.assertEqual(len(self.calls), 2)

    def test_persistent_connect_requests_restoration_and_saves_rotated_token(self):
        with tempfile.TemporaryDirectory() as directory:
            desktop = self.desktop
            desktop.shared = True
            desktop.session = None
            desktop.config = {"callTimeoutMs": 1000}
            desktop.token_path = str(pathlib.Path(directory) / "permission.json")
            desktop.restore_token = "saved"
            desktop.bus = Mock()
            desktop.bus.call_with_unix_fd_list_sync.return_value = (Mock(unpack=lambda: [0]), Mock(get=lambda _: 7))
            desktop.request = Mock(side_effect=[{"session_handle": "/session/restored"}, {}, {},
                                               {"restore_token": "rotated", "devices": 3, "streams": [(10, {"size": [1920, 1080]})]}])
            self.assertTrue(desktop.connect("deployment")["connected"])
            options = desktop.request.call_args_list[1].args[3][1]
            self.assertEqual(options["persist_mode"].unpack(), 2)
            self.assertEqual(options["restore_token"].unpack(), "saved")
            self.assertEqual(load_token(desktop.token_path), "rotated")
            self.assertEqual(desktop.restore_token, "rotated")

    def test_token_rotation_restart_and_corruption(self):
        with tempfile.TemporaryDirectory() as directory:
            path = str(pathlib.Path(directory) / "permission.json")
            self.assertIsNone(load_token(path))
            save_token(path, "first")
            self.assertEqual(load_token(path), "first")
            save_token(path, "rotated")
            self.assertEqual(load_token(path), "rotated")
            pathlib.Path(path).write_text('{"version": 99, "token": "old"}')
            with self.assertRaises(ValueError):
                load_token(path)

    def test_scaled_click_uses_stream_coordinates_and_retains_frame(self):
        self.desktop.execute("life-session", {"action": "click", "frameId": "frame", "x": 100, "y": 200})
        self.assertEqual(self.calls, [("NotifyPointerMotionAbsolute", "udd", (10, 192, 216)),
                                     ("NotifyPointerButton", "iu", (272, 1)), ("NotifyPointerButton", "iu", (272, 0))])
        self.assertEqual(self.desktop.frame["frameId"], "frame")

    def test_continuous_input_reuses_one_screenshot(self):
        for args in [{"action": "move", "x": 100, "y": 200},
                     {"action": "click", "x": 100, "y": 200},
                     {"action": "type", "text": "鲸"},
                     {"action": "key", "keys": ["Enter"]},
                     {"action": "scroll", "x": 100, "y": 200, "dy": 2}]:
            self.desktop.execute("life-session", {**args, "frameId": "frame"})
        self.assertEqual(self.calls[-1], ("NotifyPointerAxisDiscrete", "ui", (0, 2)))
        self.assertEqual(self.desktop.frame["frameId"], "frame")

    def test_keyboard_input_needs_no_screenshot_but_still_requires_consent_and_ownership(self):
        self.desktop.frame = None
        self.desktop.execute("life-session", {"action": "type", "text": "鲸"})
        self.desktop.execute("life-session", {"action": "key", "keys": ["Enter"]})
        self.assertEqual(len(self.calls), 4)
        self.assertEqual(self.calls[0], ("NotifyKeyboardKeysym", "iu", (0x01000000 | ord("鲸"), 1)))
        for owner, session, code in [("other", "/session/test", "desktop-busy"),
                                     ("life-session", None, "consent-required")]:
            self.desktop.session = session
            with self.assertRaises(portal.Refusal) as error:
                self.desktop.execute(owner, {"action": "key", "keys": ["Enter"]})
            self.assertEqual(error.exception.code, code)
        self.assertEqual(len(self.calls), 4)

    def test_coordinate_input_still_requires_the_current_screenshot(self):
        for frame, frame_id in [(None, "frame"), ({"frameId": "new"}, "frame")]:
            self.desktop.frame = frame
            with self.assertRaises(portal.Refusal) as error:
                self.desktop.execute("life-session", {"action": "click", "frameId": frame_id, "x": 10, "y": 20})
            self.assertEqual(error.exception.code, "screenshot-required")
        self.assertEqual(self.calls, [])

    def test_out_of_range_and_missing_grant_send_no_input(self):
        with self.assertRaises(portal.Refusal):
            self.desktop.execute("life-session", {"action": "move", "frameId": "frame", "x": 1000, "y": 0})
        self.desktop.session = None
        with self.assertRaises(portal.Refusal) as error:
            self.desktop.execute("life-session", {"action": "key", "frameId": "frame", "keys": ["Enter"]})
        self.assertEqual(error.exception.code, "consent-required")
        self.assertEqual(self.calls, [])

    def test_chord_releases_modifiers_when_delivery_fails(self):
        def notify(*args):
            self.calls.append(args)
            if args == ("NotifyKeyboardKeysym", "iu", (ord("a"), 1)):
                raise RuntimeError("delivery failed")
        self.desktop.notify = notify
        with self.assertRaises(RuntimeError):
            self.desktop.execute("life-session", {"action": "key", "frameId": "frame", "keys": ["Control", "a"]})
        self.assertEqual(self.calls[-2:], [("NotifyKeyboardKeysym", "iu", (ord("a"), 0)),
                                          ("NotifyKeyboardKeysym", "iu", (0xffe3, 0))])


if __name__ == "__main__":
    unittest.main()
