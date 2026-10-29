// builds the test material lists with the app's own xlsx package
const XLSX = require("/home/claude/work/it475/node_modules/xlsx");
function book(rows, file) { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Indent"); XLSX.writeFile(wb, file); }
book([["PIPESKOOL PROJECTS - Material requirement"], ["Site: SOUL"], [],
  ["Sr No", "Description of Material", "Size", "Make", "Qty", "Unit", "Remarks"],
  [1, "CPVC Tee", "20mm", "Astral", 10, "Nos", "Toilet block"],
  [2, "cpvc  tee", "25 mm", "", 4, "nos", ""],
  [3, "SWR bend 87.5 deg", '4"', "astral", 6, "Nos", ""],
  [4, "UPVC Coupler sch 40", "50mm", "", 8, "Nos", ""],
  [], [5, "Gi nut 10 mm", "", "", 15, "Kg", ""],
  [6, "Mystery widget XYZ", "", "", 2, "Nos", "client supplied?"],
  [7, "SWR bend 30 deg", "110mm", "", 3, "Nos", ""],
  [8, "Drill hammering bit", "8mm", "", "abc", "Nos", ""],
  ["", "Total", "", "", 48, "", ""]], "list1.xlsx");
book([["Item", "Quantity"], ["CPVC Tee 20mm Astral", 5], ["cpvc tee 25 mm", 2]], "list2.xlsx");
require("fs").writeFileSync("list3.csv", "Material,Qty,UOM\nCPVC Elbow 90 deg 32mm astral,12,Nos\nGun metal ball valve 1510 25mm RB,3,nos\nAG4 ms cutting wheel,20,nos\n");
console.log("ok");
