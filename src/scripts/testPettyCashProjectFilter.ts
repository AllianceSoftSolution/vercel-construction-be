import {
  filterPettyCashOperationalTargets,
  getPettyCashOperationalProjectError,
  isHeadOfficePettyCashProject,
  isPettyCashOperationalTarget,
} from "../utils/pettyCashAccess";

const checks: { name: string; pass: boolean }[] = [];
const record = (name: string, pass: boolean) => {
  checks.push({ name, pass });
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${name}`);
};

record(
  "HO-Petty identified by code",
  isHeadOfficePettyCashProject({ code: "HO-Petty", name: "Head Office Petty Cash" })
);
record(
  "HO-Petty identified by name",
  isHeadOfficePettyCashProject({ code: "OTHER", name: "Head Office Petty Cash" })
);
record(
  "HO-Petty is a valid funding target",
  isPettyCashOperationalTarget({ code: "HO-Petty", name: "Head Office Petty Cash" })
);
record(
  "Site project allowed as target",
  isPettyCashOperationalTarget({ code: "N55-LOT3", name: "N-55 LOT-3" })
);

const filtered = filterPettyCashOperationalTargets([
  { code: "HO-Petty", name: "Head Office Petty Cash" },
  { code: "N55-LOT3", name: "N-55 LOT-3" },
]);
record(
  "Operational filter keeps all projects including HO-Petty",
  filtered.length === 2
);

record(
  "Site project error is null",
  getPettyCashOperationalProjectError({ code: "N55-LOT3", name: "N-55 LOT-3" }) === null
);
record(
  "HO-Petty project error is null",
  getPettyCashOperationalProjectError({
    code: "HO-Petty",
    name: "Head Office Petty Cash",
  }) === null
);

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exitCode = 1;
