"""Opt-in real GTK/AT-SPI smoke check; only the owned fixture receives actions."""
import json
import os
import pathlib
import select
import subprocess
import sys
import time
import unittest
import uuid

sys.path.insert(0, str(pathlib.Path(__file__).parents[1] / "assets"))
from accessibility import Accessibility, GLib
from portal import Refusal


@unittest.skipUnless(os.environ.get("DSH_COMPUTER_USE_ACCESSIBILITY_E2E") == "1", "requires an operator desktop")
class SemanticDesktopSmoke(unittest.TestCase):
    def test_read_replace_text_and_activate_without_pixels(self):
        config = {"accessibilityTimeoutMs": 1000, "accessibilityMaxNodes": 100, "accessibilityMaxDepth": 12,
                  "accessibilityTextChars": 512, "accessibilityResultBytes": 32768, "maxResponseBytes": 16777216}
        backend = Accessibility(config, Refusal)
        fixture = pathlib.Path(__file__).parent / "fixtures/semantic-app.py"
        environment = {name: value for name, value in os.environ.items()
                       if not any(secret in name.upper() for secret in ("KEY", "PASSWORD", "SECRET", "TOKEN"))}
        environment.update({"GDK_BACKEND": "wayland", "GTK_A11Y": "atspi"})
        child = subprocess.Popen([sys.executable, "-u", str(fixture), "org.example.GenesisFixture.t" + uuid.uuid4().hex],
                                 env=environment, stdout=subprocess.PIPE, text=True)

        def receipt(event):
            self.assertTrue(select.select([child.stdout], [], [], 10)[0], f"No app-owned {event} receipt")
            value = json.loads(child.stdout.readline())
            self.assertEqual(value["event"], event)
            return value

        try:
            receipt("ready")
            deadline = time.monotonic() + 10
            app = None
            while time.monotonic() < deadline:
                while GLib.MainContext.default().pending():
                    GLib.MainContext.default().iteration(False)
                app = next((item for item in backend.apps()["applications"] if item["pid"] == child.pid), None)
                if app is not None:
                    break
                time.sleep(0.05)
            self.assertIsNotNone(app, "Fixture did not register on the accessibility bus")
            app_id = app["appId"]
            with self.assertRaises(Refusal):
                backend.inspect({"appId": app_id})
            backend.authorize(app_id, True)
            snapshot = backend.inspect({"appId": app_id})
            self.assertNotIn("fixture-secret-must-not-be-exposed", json.dumps(snapshot))
            entry = next(item for item in snapshot["elements"] if item["name"] == "Fixture text")
            self.assertTrue(entry["editable"], json.dumps(snapshot))
            content = "鲸鲸可以直接填写控件"
            result = backend.act({"action": "set_text", "snapshotId": snapshot["snapshotId"],
                                  "elementId": entry["elementId"], "text": content})
            self.assertTrue(result["verified"])
            self.assertEqual(receipt("changed")["text"], content)
            with self.assertRaises(Refusal):
                backend.act({"action": "set_text", "snapshotId": snapshot["snapshotId"],
                             "elementId": entry["elementId"], "text": "stale"})
            snapshot = backend.inspect({"appId": app_id, "query": "Increment"})
            button = next(item for item in snapshot["elements"] if item["name"] == "Increment")
            self.assertIn("click", button["actions"])
            result = backend.act({"action": "activate", "snapshotId": snapshot["snapshotId"],
                                  "elementId": button["elementId"], "operation": "click"})
            self.assertTrue(result["dispatched"])
            self.assertEqual(receipt("clicked")["clicks"], 1)
            backend.reset()
            self.assertEqual(backend.elements, {})
            self.assertEqual(backend.applications, {})
        finally:
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
            child.stdout.close()


if __name__ == "__main__":
    unittest.main()
