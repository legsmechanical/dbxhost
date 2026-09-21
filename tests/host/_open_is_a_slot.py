"""Write the SLOT id that leads to a project into active_set.txt.

The device's active_set.txt names the library ENTRY Move confirmed, not the
project behind it. A fixture that writes the project id instead is testing an
identity shape the device never produces — which is exactly how the
delete-the-open-project hang got past a green suite.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "standalone", "scripts"))
import library_slots as sl

dbx, project = sys.argv[1], sys.argv[2]
library = os.path.join(dbx, "sets", "library")
slot = next((s for s in sl.SLOT_IDS if sl.slot_target(library, s) == project), project)
with open(os.path.join(dbx, "active_set.txt"), "w") as f:
    f.write(slot + "\n")
