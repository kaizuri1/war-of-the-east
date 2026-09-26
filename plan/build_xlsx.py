#!/usr/bin/env python3
"""Build the War of the East unit/economy spreadsheet."""
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

thin = Side(style="thin", color="B7B7B7")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
HDR_FILL = PatternFill("solid", fgColor="1F3B2F")
HDR_FONT = Font(bold=True, color="FFFFFF", size=11)
TITLE_FONT = Font(bold=True, size=14, color="1F3B2F")
SUB_FONT = Font(bold=True, size=11, color="333333")
CHINA_FILL = PatternFill("solid", fgColor="F0EAD6")
JAPAN_FILL = PatternFill("solid", fgColor="E8E8EF")
RARE_FILL = PatternFill("solid", fgColor="FFF0C2")
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)

wb = openpyxl.Workbook()

def style_header(ws, row, ncols):
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.fill = HDR_FILL
        cell.font = HDR_FONT
        cell.alignment = CENTER
        cell.border = BORDER
    ws.row_dimensions[row].height = 26

def write_table(ws, title, subtitle, headers, rows, widths, rowfill=None):
    ws.cell(row=1, column=1, value=title).font = TITLE_FONT
    ws.cell(row=2, column=1, value=subtitle).font = Font(italic=True, size=10, color="555555")
    hr = 4
    for i, h in enumerate(headers, start=1):
        ws.cell(row=hr, column=i, value=h)
    style_header(ws, hr, len(headers))
    r = hr + 1
    for row in rows:
        for i, v in enumerate(row, start=1):
            cell = ws.cell(row=r, column=i, value=v)
            cell.border = BORDER
            cell.alignment = LEFT if i in (1, len(headers)) else CENTER
            if rowfill:
                cell.fill = rowfill
        r += 1
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = ws.cell(row=hr + 1, column=1)
    return r

# ---------------- Sheet 1: Overview & Economy ----------------
ws = wb.active
ws.title = "Overview & Economy"
ws.cell(row=1, column=1, value="WAR OF THE EAST — Core Constants").font = TITLE_FONT
rows = [
    ("Parameter", "Value", "Notes"),
    ("Map size", "60 x 60 tiles @ 32px (1920x1920)", "Seeded procedural map, two corners"),
    ("Factions", "CHINA (ROC)  vs  JAPAN (IJA)", "Mirrored rosters, real WWII hardware"),
    ("Start TIN", 1000, "Metal currency, base resource"),
    ("Start STEEL", 250, "Advanced armor / guns"),
    ("Start FUEL", 200, "Tanks + air; empty tank = 40% speed"),
    ("Starting base", "1 Depot, 1 Power Plant, 2 infantry", "Plus 2 ore fields, 1 oil field nearby"),
    ("Win condition", "Destroy enemy Construction Depot", "Engineers capture neutral/enemy buildings"),
    ("Resource 1 — TIN", "Ore Processor +6/s (on ore vein)", "Base currency for everything"),
    ("Resource 2 — STEEL", "Steel Mill -1 tin/s -> +1 steel/s", "Advanced tanks/guns cost steel"),
    ("Resource 3 — FUEL", "Fuel Depot +2/s (on oil field)", "Refills tanks free at your refinery"),
    ("POWER grid", "Plants +80 each; buildings consume", "Underpowered -> all production 50%"),
    ("Sell refund", "50% of cost", ""),
    ("Zoom / camera", "Wheel zoom, edge + minimap move", "No fog of war (C&C 95 style)"),
    ("AI behavior", "Escalating state machine", "Defense -> economy -> mass waves after 4 min"),
]
r = write_table(ws, "Core Constants", "Everything the economy & match runs on", rows[0], rows[1:], [22, 46, 40])
ws.cell(row=r + 1, column=1, value="Production pacing targets").font = SUB_FONT
pace = [
    ("Unit class", "First-available time", "Target", "Notes"),
    ("Basic infantry", "Depot + Power + Barracks", "~20 s", "Rifleman ~6s in queue"),
    ("Basic tank", "Depot + Power + Ore + Tank Factory", "~60 s", "VT-43 / Ha-Go ~20s in queue"),
    ("Basic aircraft", "+ Airfield", "~75 s", "I-16 / Ki-27"),
    ("Full base", "Economy + defenses + lab", "~6-8 min", "2 power plants minimum"),
    ("Match length", "vs AI", "12-20 min", ""),
]
write_table(ws, "", "Production pacing", pace[0], pace[1:], [24, 34, 12, 34], rowfill=None)
ws.cell(row=r + 4, column=1, value="Power budget target").font = SUB_FONT
power = [
    ("Scenario", "Plants", "Total power", "Typical spend", "Result"),
    ("Early (1 plant)", 1, 70, "Depot-10 + Ore-15 + Barracks-15 = 40", "Comfortable, room for 1 more"),
    ("Mid (2 plants)", 2, 150, "+ Tank Fctry-25 + Fuel-15 + Steel-20", "Comfortable, tight-ish"),
    ("Underpowered rule", "-", "->", "spend > capacity", "All production at 50% speed"),
]
write_table(ws, "", "Power budget", power[0], power[1:], [22, 10, 12, 46, 30])

# ---------------- Sheets 2 & 3: Infantry ----------------
INF_HDR = ["Name", "Role", "Cost $", "Steel", "HP", "Damage", "ROF (s)", "DPS", "Range (t)", "Speed", "Targets", "Notes"]
CHINA_INF = [
    ("Rifleman (88th Div. style)", "Infantry", 90, 0, 55, 9, 1.0, 9, 5, 40, "Ground", "Starter infantry"),
    ("Heavy MG (M1910 Maxim)", "Anti-infantry", 160, 0, 45, 4, 0.35, 11.4, 6, 30, "Ground", "High-DPS vs infantry"),
    ("Grenadier (M2/39)", "Splash", 130, 0, 50, 16, 1.4, 11.4, 4, 40, "Ground (splash 1.5t)", "Close splash damage"),
    ("60mm Mortar crew", "Indirect splash", 240, 40, 45, 30, 2.0, 15, 7, 28, "Ground (splash 2.2t)", "'RPG guy' equivalent; area denial"),
    ("Engineer", "Capture / repair", 120, 0, 60, 5, 1.6, 3.1, 1, 45, "Ground", "Captures buildings, repairs units"),
    ("Elite Rifleman", "Elite infantry", 180, 0, 75, 13, 0.8, 16.3, 5, 42, "Ground", "T1 upgrade required"),
]
JAPAN_INF = [
    ("Imperial Rifleman (Type 3 38)", "Infantry", 85, 0, 52, 8.5, 1.0, 8.5, 5, 40, "Ground", "Starter infantry"),
    ("Heavy Infantry (Type 92 7.7MG)", "Anti-infantry", 155, 0, 45, 4, 0.33, 12.1, 6, 30, "Ground", "High-DPS vs infantry"),
    ("Imperial Scout (fast)", "Cheap skirmisher", 70, 0, 30, 6, 1.2, 5, 5, 60, "Ground", "Low HP, fast recon/attacks"),
    ("70mm Mortar crew (Type 92)", "Indirect splash", 235, 40, 45, 29, 2.0, 14.5, 7, 28, "Ground (splash 2.2t)", "Area denial vs clusters"),
    ("Engineer", "Capture / repair", 115, 0, 60, 5, 1.6, 3.1, 1, 45, "Ground", "Captures buildings, repairs units"),
    ("Elite 'Bushido' Heavy", "Elite infantry", 185, 0, 90, 12, 0.9, 13.3, 5, 40, "Ground", "Tanky, T1 upgrade required"),
]
ws = wb.create_sheet("China Infantry")
write_table(ws, "CHINA — Infantry", "Republic of China ground forces (Nationalist)", INF_HDR, CHINA_INF, [30, 18, 9, 7, 7, 9, 8, 8, 10, 8, 20, 26], rowfill=CHINA_FILL)
ws = wb.create_sheet("Japan Infantry")
write_table(ws, "JAPAN — Infantry", "Imperial Japanese Army ground forces", INF_HDR, JAPAN_INF, [30, 18, 9, 7, 7, 9, 8, 8, 10, 8, 20, 26], rowfill=JAPAN_FILL)

# ---------------- Sheet 4 & 5: Armor & Guns ----------------
ARM_HDR = ["Name", "Role", "Cost $", "Steel", "HP", "Damage", "ROF (s)", "DPS", "Range (t)", "Speed", "Fuel", "Targets", "Tier", "Notes"]
CHINA_ARM = [
    ("VT-43 (Vickers T1934)", "Light tank", 420, 60, 220, 16, 1.2, 13.3, 6, 55, 100, "Ground / light AA", 1, "Starter tank, light AA"),
    ("T-34/76 (Soviet aid)", "Medium tank", 650, 120, 320, 34, 1.6, 21.3, 6, 60, 120, "Ground (armor vs inf)", 1, "Iconic sloped armor"),
    ("M3 Lee (Lend-Lease)", "Medium tank", 700, 130, 340, 30, 1.4, 21.4, 6.5, 62, 130, "Ground + good AA", 2, "Twin 37 + 75mm"),
    ("M4 Sherman (Lend-Lease)", "Advanced medium", 900, 180, 420, 44, 1.5, 29.3, 7, 60, 150, "Ground + AA", 2, "Strong all-round"),
    ("T-28 (Soviet heavy)", "Heavy tank (rare)", 1250, 280, 560, 62, 2.0, 31, 7, 45, 170, "Ground", 3, "Quad turret, rare"),
    ("37mm AT gun (M1 1920)", "AT defense", 300, 40, 120, 26, 1.2, 21.7, 7, 0, 0, "Anti-vehicle", 1, "Static, via Arsenal"),
    ("57mm AT gun (M2 cal.)", "Heavy AT (rare)", 550, 100, 150, 52, 2.0, 26, 8, 0, 0, "Anti-vehicle", 2, "Strong, T2"),
    ("20mm AA (M2 cal.)", "AA defense", 350, 50, 130, 18, 0.5, 36, 8, 0, 0, "Anti-air + light inf", 1, "Static, via Arsenal"),
]
JAPAN_ARM = [
    ("Type 95 Ha-Go", "Light tank", 380, 60, 190, 14, 1.1, 12.7, 6, 58, 100, "Ground / light AA", 1, "Starter tank, light AA"),
    ("Type 97 Shinhoto", "Light tank", 480, 90, 250, 20, 1.3, 15.4, 5.5, 52, 110, "Ground", 1, "Up-armored light"),
    ("Type 89 Chi-Ha", "Medium tank (workhorse)", 720, 130, 330, 33, 1.5, 22, 6.5, 58, 130, "Ground + AA (chi-ha)", 2, "Main IJA medium"),
    ("Type 1 Chi-He", "Medium tank (1943)", 880, 170, 400, 42, 1.4, 30, 7, 56, 140, "Ground + AA", 2, "Late-war medium"),
    ("Type 100 (93)", "Heavy tank (rare)", 1250, 280, 560, 60, 2.0, 30, 7, 44, 170, "Ground", 3, "Rare heavy"),
    ("Type 205 'Super Heavy'", "Super-heavy (experimental)", 1800, 450, 900, 85, 2.4, 35.4, 7.5, 30, 220, "Ground", 3, "1945 experimental, super-rare, slow"),
    ("37mm AT gun (Type 1)", "AT defense", 300, 40, 120, 26, 1.2, 21.7, 7, 0, 0, "Anti-vehicle", 1, "Static, via Arsenal"),
    ("75mm AT gun (Type 1)", "Heavy AT (rare)", 550, 100, 150, 52, 2.0, 26, 8, 0, 0, "Anti-vehicle", 2, "Strong, T2"),
    ("20mm AA (Type 98)", "AA defense", 350, 50, 130, 18, 0.5, 36, 8, 0, 0, "Anti-air + light inf", 1, "Static, via Arsenal"),
]
ws = wb.create_sheet("China Armor & Guns")
write_table(ws, "CHINA — Armor & Anti-Tank/AA", "Armored vehicles, lend-lease / Soviet aid, rare heavies", ARM_HDR, CHINA_ARM, [30, 22, 9, 7, 7, 9, 8, 8, 10, 8, 7, 20, 6, 24], rowfill=CHINA_FILL)
ws = wb.create_sheet("Japan Armor & Guns")
write_table(ws, "JAPAN — Armor & Anti-Tank/AA", "Type-numbered IJA armor incl. experimental heavies", ARM_HDR, JAPAN_ARM, [30, 22, 9, 7, 7, 9, 8, 8, 10, 8, 7, 20, 6, 24], rowfill=JAPAN_FILL)

# ---------------- Sheet 6: Aircraft ----------------
AIR_HDR = ["Name", "Role", "Cost $", "HP", "Damage", "ROF (s)", "DPS", "Range (t)", "Speed", "Targets", "Tier", "Notes"]
CHINA_AIR = [
    ("I-16 'Fighting Yak'", "Basic fighter/ground", 450, 120, 16, 1.0, 16, 5, 90, "Ground + Air", 1, "Soviet, starter air"),
    ("P-40 Tomahawk", "Advanced fighter (Flying Tigers)", 650, 160, 26, 1.1, 23.6, 5, 95, "Ground + Air", 2, "Iconic Lend-Lease"),
    ("P-38 Lightning", "Heavy fighter (Lend-Lease)", 950, 200, 34, 1.2, 28.3, 6, 105, "Ground + Air", 2, "Twin-boom, strong"),
]
JAPAN_AIR = [
    ("Ki-27", "Basic fighter", 430, 110, 15, 1.0, 15, 5, 92, "Ground + Air", 1, "Soviet-era, basic"),
    ("Mitsubishi A6M 'Zero'", "Elite scout fighter", 680, 150, 24, 1.0, 24, 5, 105, "Ground + Air", 2, "Iconic; fast but fragile armor"),
    ("Ki-43 'Hayabusa'", "Fighter", 750, 175, 28, 1.1, 25.5, 5, 100, "Ground + Air", 2, "Nimble 1941 fighter"),
    ("Ki-84 'Hayate'", "Advanced fighter (1944)", 980, 210, 36, 1.2, 30, 6, 102, "Ground + Air", 2, "Late-war best"),
    ("Ki-61 'Hiyori'", "Heavy fighter (rare)", 1250, 240, 46, 1.3, 35.4, 6, 110, "Ground + Air", 3, "Rare, high speed"),
]
ws = wb.create_sheet("Aircraft")
ws.cell(row=1, column=1, value="CHINA — Aircraft").font = SUB_FONT
r = write_table(ws, "CHINA", "Soviet aid + Lend-Lease", AIR_HDR, CHINA_AIR, [28, 24, 9, 7, 9, 8, 8, 10, 8, 18, 6, 26], rowfill=CHINA_FILL)
ws.cell(row=r + 1, column=1, value="JAPAN — Aircraft").font = SUB_FONT
write_table(ws, "JAPAN", "Imperial Japanese Army Air Force", AIR_HDR, JAPAN_AIR, [28, 24, 9, 7, 9, 8, 8, 10, 8, 18, 6, 26], rowfill=JAPAN_FILL)
# rare highlight
for rr in range(r + 4, r + 4 + len(JAPAN_AIR)):
    for cc in range(1, len(AIR_HDR) + 1):
        if ws.cell(row=rr, column=13-1+1).value == 3 or ws.cell(row=rr, column=11).value == 3:
            ws.cell(row=rr, column=cc).fill = RARE_FILL

# ---------------- Sheet 7: Buildings ----------------
BLD_HDR = ["Building", "Power (+/-)", "HP", "Cost $", "Build (s)", "Slots", "Produces / Output", "Placement / Notes"]
CHINA_BLD = [
    ("Construction Depot 建造厂", -10, 2200, 400, 0, 3, "Builds all buildings", "HQ + win condition"),
    ("Power Plant 发电厂", 80, 400, 300, 6, "-", "Power grid", "One every ~2 expansions"),
    ("Ore Processor 矿场", -15, 350, 350, 6, "-", "+6 TIN/s", "Must sit on ore vein"),
    ("Steel Mill 钢厂", -20, 400, 500, 8, "-", "-1 TIN/s -> +1 STEEL/s", "Advanced armor/guns"),
    ("Fuel Depot 炼油厂", -15, 350, 400, 7, "-", "+2 FUEL/s; refills tanks", "Must sit on oil field"),
    ("Barracks 兵营", -15, 500, 450, 10, 2, "All infantry", "2 queue slots"),
    ("Tank Factory 战车厂", -25, 650, 700, 15, 1, "All armor", "1 slot, slow"),
    ("Airfield 飞机场", -40, 700, 900, 20, 1, "All aircraft", "1 slot, slowest"),
    ("Arsenal 军械厂", -20, 600, 600, 14, 1, "Placeable AT/AA guns", "Builds static guns onto map"),
    ("Upgrades Lab 研究所", -20, 550, 800, 20, "-", "T1/T2/T3 global upgrades", "Required for elites"),
    ("Watchtower 警备塔", 0, 300, 150, 5, "-", "Self (8 dmg, 6t)", "Cheap early defense"),
    ("MG Bunker 机枪堡", 0, 450, 300, 8, "-", "Self (18 DPS, 6t)", "Strong vs infantry"),
    ("Concrete Bunker 地下掩体", 0, 900, 600, 12, "-", "Self (13.75 DPS, 6.5t)", "Elite static defense"),
    ("Barbed Wire 铁丝网", 0, 200, 50, 3, "-", "Blocks movement", "Cheap blocker"),
]
JAPAN_BLD = [
    ("Construction Depot 工兵营", -10, 2200, 400, 0, 3, "Builds all buildings", "HQ + win condition"),
    ("Power Plant 発電所", 80, 400, 300, 6, "-", "Power grid", "One every ~2 expansions"),
    ("Ore Processor 鉱石加工所", -15, 350, 350, 6, "-", "+6 TIN/s", "Must sit on ore vein"),
    ("Steel Mill 製鉄所", -20, 400, 500, 8, "-", "-1 TIN/s -> +1 STEEL/s", "Advanced armor/guns"),
    ("Fuel Depot 油槽所", -15, 350, 400, 7, "-", "+2 FUEL/s; refills tanks", "Must sit on oil field"),
    ("Barracks / 驻屯地", -15, 500, 450, 10, 2, "All infantry", "2 queue slots"),
    ("Tank Factory 战车工厂", -25, 650, 700, 15, 1, "All armor", "1 slot, slow"),
    ("Airfield 飛行場", -40, 700, 900, 20, 1, "All aircraft", "1 slot, slowest"),
    ("Arsenal / 兵器厂", -20, 600, 600, 14, 1, "Placeable AT/AA guns", "Builds static guns onto map"),
    ("Upgrades Lab 研究施設", -20, 550, 800, 20, "-", "T1/T2/T3 global upgrades", "Required for elites"),
    ("Watchtower 哨戒塔", 0, 300, 150, 5, "-", "Self (8 dmg, 6t)", "Cheap early defense"),
    ("MG Bunker 机枪堡", 0, 450, 300, 8, "-", "Self (18 DPS, 6t)", "Strong vs infantry"),
    ("Concrete Bunker 防波堤掩体", 0, 900, 600, 12, "-", "Self (13.75 DPS, 6.5t)", "Elite static defense"),
    ("Barbed Wire 铁丝网", 0, 200, 50, 3, "-", "Blocks movement", "Cheap blocker"),
]
ws = wb.create_sheet("Buildings")
ws.cell(row=1, column=1, value="CHINA — Buildings").font = SUB_FONT
r = write_table(ws, "CHINA", "NCO = Construction Depot; everything built from it", BLD_HDR, CHINA_BLD, [28, 12, 7, 9, 9, 7, 26, 28], rowfill=CHINA_FILL)
ws.cell(row=r + 1, column=1, value="JAPAN — Buildings").font = SUB_FONT
write_table(ws, "JAPAN", "Mirrored (real Japanese facility names)", BLD_HDR, JAPAN_BLD, [28, 12, 7, 9, 9, 7, 26, 28], rowfill=JAPAN_FILL)

# ---------------- Sheet 8: Upgrades & Tuning ----------------
ws = wb.create_sheet("Upgrades & Tuning")
UP_HDR = ["Tier", "Upgrade", "Effect", "Cost $", "Time (s)", "Unlocks"]
UPS = [
    ("T1", "Infantry Damage +", "Infantry damage +15%", 600, 60, "Elite Rifleman / Bushido"),
    ("T1", "Armor HP +", "All armor HP +10%", 600, 60, "-"),
    ("T2", "Vehicle Speed +", "Vehicle/air speed +10%", 650, 75, "M3 Lee / Chi-He / P-40 / Zero"),
    ("T2", "AT + AA Damage +", "AT/AA gun damage +20%", 650, 75, "Heavy AT / heavy AA"),
    ("T3", "Elite Offensive", "All units +10% damage", 750, 90, "T-28 / Type 100 / P-38 / Ki-84 / Ki-61"),
    ("T3", "Super-Heavy Program", "Unlocks experimental heavies", 750, 90, "Type 205 Super Heavy (Japan)"),
]
write_table(ws, "Global Upgrade Tiers (lab, 3 tiers)", "One global tier per side; C&C style", UP_HDR, UPS, [7, 22, 26, 9, 9, 30])
ws.cell(row=12, column=1, value="Tuning constants").font = SUB_FONT
TUNE = [
    ("Constant", "Value", "Notes"),
    ("Underpower production multiplier", 0.5, "When power < capacity"),
    ("Sell refund ratio", 0.5, "50%"),
    ("Capture time (engineer/sec)", 0.25, "4s on a 100hp-neutral building baseline; scales w/ HP"),
    ("Repair rate (hp/s)", 30, "Engineers repairing own units"),
    ("Tank fuel burn (fuel/sec)", 0.15, "Empty -> speed x 0.4"),
    ("Tank refuel (fuel/sec)", 25, "At own refinery/tank factory"),
    ("AI wave interval (s)", 45, "Escalating"),
    ("AI aggro threshold (min)", 4, "Mass armor+air after this"),
    ("Max units per side (soft cap)", 120, "Perf + sanity cap"),
    ("Zoom range (x)", "0.5 - 2.0", "Wheel"),
    ("Map RNG seed (default)", "20260924", "Deterministic maps"),
    ("Combat log window", "last 200 events", "For debug"),
]
write_table(ws, "Tuning constants", "Single source in config.js; tune here first", TUNE, [34, 14, 40], start_row=13) if False else None
hr = 13
for i, h in enumerate(TUNE[0], 1):
    ws.cell(row=hr, column=i, value=h)
style_header(ws, hr, len(TUNE[0]))
rr = hr + 1
for row in TUNE[1:]:
    for i, v in enumerate(row, 1):
        c = ws.cell(row=rr, column=i, value=v)
        c.border = BORDER
        c.alignment = LEFT if i in (1, 3) else CENTER
    rr += 1
for i, w in enumerate([34, 14, 40], 1):
    ws.column_dimensions[get_column_letter(i)].width = w

# ---------------- Sheet 9: Balance & Testing Plan ----------------
ws = wb.create_sheet("Balance & Testing Plan")
ws.cell(row=1, column=1, value="Balance & Playtest Plan").font = TITLE_FONT
items = [
    ("Symmetry audit", "Every China unit has a Japan counterpart; verify cost/HP/DPS within ±10%"),
    ("Ramp check", "Simulate a passive AI vs AI for 20 min; dump unit counts + money; confirm no runaway"),
    ("Power check", "Confirm 1-plant base stays comfortable, 2-plant needed mid-game (not soft-locked)"),
    ("Rare-unit ceiling", "T-28 / Type 100 / 205 / P-38 / Ki-61 must not arrive before ~8 min"),
    ("AA vs Air", "Verify AA guns can realistically hold a small air wave; air not free wins"),
    ("AT vs Armor", "37mm can't stop heavies, 57/75mm can; heavies out-dagger AT guns in the open"),
    ("Capture exploit", "Ensure a single engineer can't flip an enemy base instantly (time scales with HP)"),
    ("Fuel economy", "Tanks empty at ~30 min continuous travel; refinery refills in ~30 s"),
    ("AI difficulty", "Lose-able by a careful player, winnable without cheese; no infinite barracks loops"),
    ("Perf cap", "120 units/side @ 60fps; confirm on mid-range hardware"),
    ("Controls regression", "Full control list re-tested after each content drop"),
    ("Art swap", "Verify generated-sprite -> PNG override loader renders identical hitboxes"),
]
hr = 3
ws.cell(row=hr, column=1, value="Check")
ws.cell(row=hr, column=2, value="Pass criteria")
style_header(ws, hr, 2)
rr = hr + 1
for name, crit in items:
    ws.cell(row=rr, column=1, value=name).alignment = LEFT
    ws.cell(row=rr, column=2, value=crit).alignment = LEFT
    for cc in (1, 2):
        ws.cell(row=rr, column=cc).border = BORDER
    rr += 1
ws.column_dimensions['A'].width = 22
ws.column_dimensions['B'].width = 78

out = r"C:\Users\kaizu\war-of-the-east\plan\unit-economy-spreadsheet.xlsx"
wb.save(out)
print("Saved:", out)
for s in wb.sheetnames:
    print("  sheet:", s)
