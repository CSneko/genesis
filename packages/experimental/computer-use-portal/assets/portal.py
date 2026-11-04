"""Private JSON-line worker for one consented XDG RemoteDesktop session.

The parent owns process deadlines and termination. Losing this process closes
its D-Bus connection, PipeWire fd, and live portal grant. Configured restore
tokens permit a new grant at the next startup.
"""
import base64
import json
import os
import sys
import uuid

from permission_store import load_token, save_token
from worker_io import emit, prepare_stdio

import gi

gi.require_version("Gst", "1.0")
gi.require_version("GstVideo", "1.0")
gi.require_version("GdkPixbuf", "2.0")
from gi.repository import Gio, GLib, Gst, GstVideo, GdkPixbuf

DEST = "org.freedesktop.portal.Desktop"
PATH = "/org/freedesktop/portal/desktop"
RD = "org.freedesktop.portal.RemoteDesktop"
SC = "org.freedesktop.portal.ScreenCast"


class Refusal(Exception):
    """Expected operation failure with a stable machine code."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


class Desktop:
    def __init__(self, config):
        self.config = config
        self.shared = config["autoConnect"]
        self.token_path = config.get("restoreTokenPath")
        self.restore_token = load_token(self.token_path) if self.shared else None
        self.accessibility = None
        if config["accessibilityEnabled"]:
            from accessibility import Accessibility
            self.accessibility = Accessibility(config, Refusal)
        Gst.init(None)
        for plugin in ("pipewiresrc", "videoconvert", "appsink"):
            if not Gst.ElementFactory.find(plugin):
                raise RuntimeError(f"Missing GStreamer {plugin}; install the PipeWire/GStreamer plugins and restart DSH.")
        self.bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        self.session = None
        self.owner = None
        self.fd = None
        self.stream = None
        self.geometry = None
        self.frame = None
        self.devices = 0
        self.closed_subscription = None
        self.versions = {}
        for interface in (RD, SC):
            value = self.call("org.freedesktop.DBus.Properties", "Get", "(ss)", (interface, "version"))
            self.versions[interface] = value[0]

    def call(self, interface, method, signature, values, path=PATH):
        result = self.bus.call_sync(DEST, path, interface, method,
                                    GLib.Variant(signature, values), None,
                                    Gio.DBusCallFlags.NONE, self.config["callTimeoutMs"], None)
        return result.unpack()

    def request(self, interface, method, signature, values):
        token = "genesis_" + uuid.uuid4().hex
        options = dict(values[-1])
        options["handle_token"] = GLib.Variant("s", token)
        values = (*values[:-1], options)
        sender = self.bus.get_unique_name()[1:].replace(".", "_")
        request_path = f"/org/freedesktop/portal/desktop/request/{sender}/{token}"
        loop = GLib.MainLoop()
        response = []

        def received(_bus, _sender, _path, _iface, _signal, parameters):
            response.append(parameters.unpack())
            loop.quit()

        subscription = self.bus.signal_subscribe(DEST, "org.freedesktop.portal.Request", "Response",
                                                request_path, None, Gio.DBusSignalFlags.NONE, received)

        def expired():
            response.append((3, {}))
            try:
                self.call("org.freedesktop.portal.Request", "Close", "()", (), request_path)
            except GLib.Error as error:
                # An already settled or removed request needs no further cancellation.
                print(f"Portal request close: {error.message}", file=sys.stderr)
            loop.quit()
            return GLib.SOURCE_REMOVE

        timeout = GLib.timeout_add(self.config["consentTimeoutMs"], expired)
        try:
            actual = self.call(interface, method, signature, values)[0]
            if actual != request_path:
                raise Refusal("request-mismatch", "The portal returned an unexpected request path. Reconnect before acting.")
            if not response:
                loop.run()
            code, data = response[0]
            if code != 0:
                raise Refusal("consent-denied" if code == 1 else "portal-request-failed",
                              "Desktop consent was cancelled, denied, or expired. Ask the operator before reconnecting.")
            return data
        finally:
            if not response or response[0][0] != 3:
                GLib.source_remove(timeout)
            self.bus.signal_unsubscribe(subscription)

    def close(self):
        if self.accessibility is not None:
            self.accessibility.reset()
        session, self.session = self.session, None
        self.owner = None
        self.frame = None
        self.geometry = None
        self.stream = None
        self.devices = 0
        if self.closed_subscription is not None:
            self.bus.signal_unsubscribe(self.closed_subscription)
            self.closed_subscription = None
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None
        if session is not None:
            try:
                self.call("org.freedesktop.portal.Session", "Close", "()", (), session)
            except GLib.Error as error:
                # Process exit closes the bus even when the portal's outcome is unknown.
                print(f"Portal session close failed; ending desktop access: {error.message}", file=sys.stderr, flush=True)
                os._exit(1)

    def connect(self, owner):
        if self.session:
            if self.owner != owner:
                raise Refusal("desktop-busy", "Another conversation owns desktop consent. Disconnect there or stop sharing in GNOME first.")
            return self.status()
        token = "life_" + uuid.uuid4().hex
        data = self.request(RD, "CreateSession", "(a{sv})", ({"session_handle_token": GLib.Variant("s", token)},))
        self.session = data["session_handle"]
        self.owner = owner
        self.closed_subscription = self.bus.signal_subscribe(
            DEST, "org.freedesktop.portal.Session", "Closed", self.session, None,
            Gio.DBusSignalFlags.NONE, lambda *_args: self.revoked())
        try:
            devices = {"types": GLib.Variant("u", 3)}
            if self.shared:
                if self.versions[RD] < 2:
                    raise Refusal("persistence-unavailable", "Persistent desktop access requires RemoteDesktop portal version 2. Disable autoConnect or upgrade the portal.")
                devices["persist_mode"] = GLib.Variant("u", 2)
                if self.restore_token is not None:
                    devices["restore_token"] = GLib.Variant("s", self.restore_token)
            self.request(RD, "SelectDevices", "(oa{sv})", (self.session, devices))
            self.request(SC, "SelectSources", "(oa{sv})", (self.session, {
                "types": GLib.Variant("u", 1), "multiple": GLib.Variant("b", False)}))
            data = self.request(RD, "Start", "(osa{sv})", (self.session, "", {}))
            if self.shared:
                token = data.get("restore_token")
                if not isinstance(token, str) or not token:
                    raise Refusal("persistence-unavailable", "The portal did not grant persistent access. Disable autoConnect or enable persistent permission in the desktop portal.")
                save_token(self.token_path, token)
                self.restore_token = token
            streams = data.get("streams", [])
            self.devices = data.get("devices", 0)
            if len(streams) != 1 or self.devices & 3 != 3:
                raise Refusal("incomplete-grant", "Grant one monitor, keyboard, and pointer to use computer control. No input was sent.")
            self.stream, properties = streams[0]
            self.geometry = properties.get("size")
            if not self.geometry or min(self.geometry) <= 0:
                raise Refusal("missing-geometry", "The portal did not report monitor coordinates. Desktop input is disabled.")
            result, descriptors = self.bus.call_with_unix_fd_list_sync(
                DEST, PATH, SC, "OpenPipeWireRemote", GLib.Variant("(oa{sv})", (self.session, {})),
                GLib.VariantType.new("(h)"), Gio.DBusCallFlags.NONE, self.config["callTimeoutMs"], None, None)
            self.fd = descriptors.get(result.unpack()[0])
            return self.status()
        except Exception:
            self.close()
            raise

    def revoked(self):
        self.session = None
        self.close()

    def status(self, owner=None):
        busy = self.session is not None and owner is not None and owner != self.owner
        return {"connected": self.session is not None and not busy, "backend": "xdg-desktop-portal",
                "accessibilityAvailable": self.accessibility is not None, "remoteDesktopVersion": self.versions[RD], "screenCastVersion": self.versions[SC],
                "logicalSize": None if busy else self.geometry, "devices": 0 if busy else self.devices,
                "permission": "owned-by-another-conversation" if busy else "granted" if self.session else "not-granted"}

    def require_owner(self, owner):
        if not self.session:
            raise Refusal("consent-required", "Connect and complete GNOME desktop consent before observing or acting.")
        if owner != self.owner:
            raise Refusal("desktop-busy", "Desktop consent belongs to another conversation. No input was sent.")

    def notify(self, method, suffix, values):
        self.call(RD, method, "(oa{sv}" + suffix + ")", (self.session, {}, *values))

    def screenshot(self):
        self.frame = None
        # Reconnecting the stream requests a current frame, including on static desktops.
        pipeline = Gst.parse_launch(f"pipewiresrc fd={self.fd} path={self.stream} num-buffers=1 ! "
                                    "videoconvert ! video/x-raw,format=RGB ! appsink name=frame sync=false max-buffers=1 drop=true")
        try:
            pipeline.set_state(Gst.State.PLAYING)
            sink = pipeline.get_by_name("frame")
            sample = sink.emit("try-pull-sample", self.config["callTimeoutMs"] * Gst.MSECOND)
            if sample is None:
                raise Refusal("capture-failed", "No current PipeWire frame arrived. Check screen sharing and reconnect before acting.")
            info = GstVideo.VideoInfo.new_from_caps(sample.get_caps())
            buffer = sample.get_buffer()
            raw = buffer.extract_dup(0, buffer.get_size())
            pixbuf = GdkPixbuf.Pixbuf.new_from_bytes(GLib.Bytes.new(raw), GdkPixbuf.Colorspace.RGB,
                                                    False, 8, info.width, info.height, info.stride[0])
            scale = min(1, self.config["maxImageDimension"] / max(info.width, info.height))
            width, height = max(1, round(info.width * scale)), max(1, round(info.height * scale))
            if scale < 1:
                pixbuf = pixbuf.scale_simple(width, height, GdkPixbuf.InterpType.BILINEAR)
            success, png = pixbuf.save_to_bufferv("png", [], [])
            if not success or len(png) > self.config["maxResponseBytes"] // 2:
                raise Refusal("image-too-large", "The desktop image exceeds the configured response budget. Lower maxImageDimension.")
            self.frame = {"frameId": uuid.uuid4().hex, "width": width, "height": height,
                          "logicalSize": self.geometry, "stream": self.stream}
            return {"content": [{"type": "text", "text": json.dumps(self.frame)},
                                {"type": "image", "mimeType": "image/png", "data": base64.b64encode(png).decode()}]}
        finally:
            pipeline.set_state(Gst.State.NULL)

    def position(self, args):
        frame = self.frame
        if not frame or args.get("frameId") != frame["frameId"]:
            raise Refusal("screenshot-required", "Take a new screenshot and use its frameId before coordinate input.")
        x, y = args["x"], args["y"]
        if not (0 <= x < 1000 and 0 <= y < 1000):
            raise Refusal("invalid-coordinates", "Coordinates must be normalized to the range 0 through below 1000.")
        self.notify("NotifyPointerMotionAbsolute", "udd",
                    (self.stream, x * self.geometry[0] / 1000, y * self.geometry[1] / 1000))

    def execute(self, owner, args):
        action = args["action"]
        if self.shared:
            if action == "release":
                return text({"released": False, "scope": "deployment"})
            owner = "deployment"
        if action == "release":
            if self.owner == owner:
                self.close()
            return text({"released": True})
        if action == "status":
            return text(self.status(owner))
        if action == "connect":
            return text(self.connect(owner))
        self.require_owner(owner)
        if action == "disconnect":
            self.close()
            return text(self.status())
        if action in ("apps", "app_info", "authorize_app", "deny_app", "inspect", "activate", "set_text", "focus"):
            if self.accessibility is None:
                raise Refusal("accessibility-disabled", "Enable accessibilityEnabled and install the Atspi GI module for semantic desktop access.")
            if action == "apps":
                return text(self.accessibility.apps())
            if action == "app_info":
                return text(self.accessibility.app_info(args["appId"]))
            if action in ("authorize_app", "deny_app"):
                return text(self.accessibility.authorize(args["appId"], action == "authorize_app"))
            if action == "inspect":
                return text(self.accessibility.inspect(args))
            return text(self.accessibility.act(args))
        if action == "screenshot":
            return self.screenshot()
        if action in ("type", "key") and args.get("frameId") is not None:
            if not self.frame or args["frameId"] != self.frame["frameId"]:
                raise Refusal("screenshot-required", "Omit frameId for keyboard input, or use the latest screenshot frameId.")
        if self.accessibility is not None:
            self.accessibility.invalidate()
        if action in ("click", "move"):
            self.position(args)
            if action == "click":
                button = {"left": 272, "right": 273, "middle": 274}[args.get("button", "left")]
                try:
                    self.notify("NotifyPointerButton", "iu", (button, 1))
                finally:
                    self.notify("NotifyPointerButton", "iu", (button, 0))
        elif action == "scroll":
            self.position(args)
            for axis, steps in enumerate((args.get("dy", 0), args.get("dx", 0))):
                if steps:
                    self.notify("NotifyPointerAxisDiscrete", "ui", (axis, steps))
        elif action == "type":
            for character in args["text"]:
                code = ord(character)
                symbol = code if 0x20 <= code <= 0xff else 0x01000000 | code
                if character == "\n":
                    symbol = 0xff0d
                elif character == "\t":
                    symbol = 0xff09
                self.stroke(symbol)
        elif action == "key":
            names = {"Enter": 0xff0d, "Tab": 0xff09, "Escape": 0xff1b, "BackSpace": 0xff08,
                     "Delete": 0xffff, "Left": 0xff51, "Up": 0xff52, "Right": 0xff53, "Down": 0xff54,
                     "Home": 0xff50, "End": 0xff57, "PageUp": 0xff55, "PageDown": 0xff56,
                     "Control": 0xffe3, "Shift": 0xffe1, "Alt": 0xffe9, "Super": 0xffeb,
                     **{f"F{i}": 0xffbd + i for i in range(1, 13)}}
            keys = [names.get(key, ord(key) if len(key) == 1 else None) for key in args["keys"]]
            if any(key is None for key in keys):
                raise Refusal("invalid-key", "Use a single character or a supported named key.")
            pressed = []
            try:
                for key in keys:
                    pressed.append(key)
                    self.notify("NotifyKeyboardKeysym", "iu", (key, 1))
            finally:
                for key in reversed(pressed):
                    self.notify("NotifyKeyboardKeysym", "iu", (key, 0))
        else:
            raise Refusal("invalid-action", "Unknown computer action.")
        return text({"dispatched": True, "verified": False, "next": "Observe again when needed to locate targets or verify the result. Input affects the currently focused application."})

    def stroke(self, symbol):
        try:
            self.notify("NotifyKeyboardKeysym", "iu", (symbol, 1))
        finally:
            self.notify("NotifyKeyboardKeysym", "iu", (symbol, 0))


def text(value):
    return {"content": [{"type": "text", "text": json.dumps(value, ensure_ascii=False)}]}


def main():
    prepare_stdio()
    config = json.loads(sys.argv[1])
    desktop = Desktop(config)
    loop = GLib.MainLoop()
    try:
        if desktop.shared:
            desktop.connect("deployment")
    except Exception:
        desktop.close()
        raise
    emit({"ready": True})

    def readable(_fd, condition):
        if not condition & GLib.IO_IN:
            loop.quit()
            return GLib.SOURCE_REMOVE
        line = sys.stdin.readline(config["maxTextChars"] * 6 + 4096)
        if not line:
            loop.quit()
            return GLib.SOURCE_REMOVE
        try:
            request = json.loads(line)
        except (ValueError, TypeError) as error:
            print(f"Invalid desktop worker request: {error}", file=sys.stderr)
            loop.quit()
            return GLib.SOURCE_REMOVE
        try:
            result = desktop.execute(request["owner"], request["args"])
        except Refusal as error:
            result = {"isError": True, **text({"code": error.code, "message": str(error)})}
        except Exception as error:
            desktop.close()
            # Failed input can have reached the compositor; do not replay it.
            result = {"isError": True, **text({"code": "portal-failed", "message": str(error),
                       "outcome": "unknown", "next": "Desktop access was closed. Reconnect and inspect before retrying."})}
        emit({"id": request["id"], "result": result})
        return GLib.SOURCE_CONTINUE

    GLib.io_add_watch(sys.stdin.fileno(), GLib.IO_IN | GLib.IO_HUP | GLib.IO_ERR, readable)
    try:
        loop.run()
    finally:
        desktop.close()


if __name__ == "__main__":
    main()
