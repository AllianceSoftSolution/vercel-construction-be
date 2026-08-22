import {
  filterPettyCashSelectableProjects,
  getPettyCashOperationalProjectError,
  isPettyCashSelectableProject,
} from "../utils/pettyCashAccess";

const checks: { name: string; pass: boolean }[] = [];
const record = (name: string, pass: boolean) => {
  checks.push({ name, pass });
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${name}`);
};

record(
  "HO-Petty excluded by code",
  !isPettyCashSelectableProject({ code: "HO-Petty", name: "Head Office Petty Cash" })
);
record(
  "HO-Petty excluded by name",
  !isPettyCashSelectableProject({ code: "OTHER", name: "Head Office Petty Cash" })
);
record(
  "Operational project allowed",
  isPettyCashSelectableProject({ code: "N55-LOT3", name: "N-55 LOT-3" })
);

const filtered = filterPettyCashSelectableProjects([
  { code: "HO-Petty", name: "Head Office Petty Cash" },
  { code: "N55-LOT3", name: "N-55 LOT-3" },
]);
record("Filter keeps operational projects only", filtered.length === 1 && filtered[0].code === "N55-LOT3");

record(
  "Operational project error is null",
  getPettyCashOperationalProjectError({ code: "N55-LOT3", name: "N-55 LOT-3" }) === null
);
record(
  "HO pool project error message set",
  typeof getPettyCashOperationalProjectError({
    code: "HO-Petty",
    name: "Head Office Petty Cash",
  }) === "string"
);

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exitCode = 1;
