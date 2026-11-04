#!/usr/bin/python3
"""Owned GTK fixture exposing app-owned text and click receipts on stdout."""
import json
import sys
import gi

gi.require_version("Gtk", "3.0")
from gi.repository import Gio, GLib, Gtk

app = Gtk.Application(application_id=sys.argv[1], flags=Gio.ApplicationFlags.NON_UNIQUE)
state = {"text": "", "clicks": 0}


def emit(event):
    print(json.dumps({"event": event, **state}), flush=True)


def activate(application):
    window = Gtk.ApplicationWindow(application=application, title=sys.argv[1])
    window.set_default_size(420, 220)
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
    entry = Gtk.Entry()
    entry.get_accessible().set_name("Fixture text")
    entry.connect("changed", lambda widget: changed(widget.get_text()))
    password = Gtk.Entry()
    password.set_visibility(False)
    password.set_text("fixture-secret-must-not-be-exposed")
    password.get_accessible().set_name("Fixture password")
    button = Gtk.Button(label="Increment")
    button.connect("clicked", clicked)
    box.pack_start(entry, False, False, 0)
    box.pack_start(password, False, False, 0)
    box.pack_start(button, False, False, 0)
    window.add(box)
    window.show_all()
    emit("ready")


def changed(text):
    state["text"] = text
    emit("changed")


def clicked(_button):
    state["clicks"] += 1
    emit("clicked")


app.connect("activate", activate)
app.run([sys.argv[0]])
