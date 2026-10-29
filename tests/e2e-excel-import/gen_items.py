# synthetic Item Master in the live naming pattern: "Type - MATERIAL Sub Size (Class) [MAKE]"
import itertools, json, random
random.seed(7)
rows = []
def add(t, m, st=None, sz=None, cl=None, mk=None, u="Nos"): rows.append((t, m, st, sz, cl, mk, u))
cp = [15, 20, 25, 32, 40, 50]
for sub in ["Tee", "Elbow 90°", "Elbow 45°", "Coupler", "Reducer Tee", "Female Adaptor Brass", "Male Adaptor Brass", "End Cap", "Union", "Sweep Bend", "Ball Valve", "Tank Nipple"]:
    for s in cp: add("Fitting", "CPVC", sub, f"{s}mm", None, "ASTRAL")
for sub in ["Tee", "Elbow 90°", "Coupler", "End Cap", "Long Radius Bend", "Union", "FAPT", "MAPT", "Flange Ring"]:
    for s in [20, 25, 32, 40, 50, 65, 80, 100, 150, 200]:
        for cl in ["SCHEDULE 40", "SCHEDULE 80"]: add("Fitting", "UPVC", sub, f"{s}mm", cl, "ASTRAL")
for sub in ["BEND 87.5°", "BEND 45°", "SINGLE Y", "DOOR BEND 87.5°", "TEE", "COUPLER", "PIPE CLIP", "P TRAP (LONG)", "REDUCER COUPLER"]:
    for s in [75, 90, 110, 160]: add("Fitting", "PVC SWR", sub, f"{s}mm", "SELFIT", "ASTRAL")
    for s in [75, 110]: add("Fitting", "PVC SWR", sub, f"{s}mm", "SELFIT", "SUPREME")
for s in [15, 20, 25, 32, 40, 50]: add("Pipe", "CPVC", None, f"{s}mm", "SDR 11", "ASTRAL", "Mtr")
for s in [75, 110, 160]: add("Pipe", "PVC SWR", None, f"{s}mm", "6 KG", "ASTRAL", "Mtr")
for s in ["15mm", "20mm", "25mm", "32mm"]: add("Valve", "Gun Metal Ball Valve", "1510", s, None, "RB")
for x in ["2.5Inch long jasti khilla", "3Inch long jasti khilla", "2inch Gi Z patti 1.5mm thick", "AG4 ms cutting wheel", "Bullet fastner fisher 10 mm", "Gi nut 10 mm", "Gi threaded tie rod 10 mm"]:
    add("Hardware", x, None, None, None, None)
for s in ["6mm", "8mm", "12mm"]: add("Hardware", "Drill hammering bit", None, s, None, None)
for s in ["25mm", "110mm"]: add("Hardware", "Gi U clamp with nut and washer", None, s, None, None)
print(len(rows))
with open("items.sql", "w") as f:
    f.write("insert into item_master (item_type, material, sub_type, size, item_class, make, unit) values\n")
    def q(v): return "null" if v is None else "'" + v.replace("'", "''") + "'"
    f.write(",\n".join("(" + ",".join(q(v) for v in r) + ")" for r in rows) + ";\n")
