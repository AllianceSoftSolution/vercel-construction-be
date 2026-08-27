import { UserRole } from "@prisma/client";
import type { UserSpec } from "./n55UserSeedShared";

export const LOT3_USER_SPECS: UserSpec[] = [
  {
    lot: "LOT3",
    group: "Section Accountant",
    name: "SA1 N55 LOT3 Section 1",
    email: "SA1-N55lot3-Section1@radc.com",
    employeeId: "N55LOT3-SA1-001",
    role: UserRole.ACCOUNTANT,
    isHead: false,
  },
  {
    lot: "LOT3",
    group: "Section Accountant",
    name: "SA2 N55 LOT3 Section 2",
    email: "SA2-N55lot3-Section2@radc.com",
    employeeId: "N55LOT3-SA2-001",
    role: UserRole.ACCOUNTANT,
    isHead: false,
  },
  {
    lot: "LOT3",
    group: "Section Accountant",
    name: "SA3 N55 LOT3 Section 3",
    email: "SA3-N55lot3-Section3@radc.com",
    employeeId: "N55LOT3-SA3-001",
    role: UserRole.ACCOUNTANT,
    isHead: false,
  },
  {
    lot: "LOT3",
    group: "Site Incharge",
    name: "Site Incharge N55 LOT3",
    email: "SI-N55lot3@radc.com",
    employeeId: "N55LOT3-SI-001",
    role: UserRole.SITE_INCHARGE,
    isHead: false,
  },
  {
    lot: "LOT3",
    group: "Head Store",
    name: "Head Store N55 LOT3",
    email: "HS-N55lot3@radc.com",
    employeeId: "N55LOT3-HS-001",
    role: UserRole.STORE_INCHARGE,
    isHead: true,
  },
  ...Array.from({ length: 5 }, (_, index) => {
    const n = index + 1;
    return {
      lot: "LOT3" as const,
      group: "Section Store",
      name: `Section Store ${n} N55 LOT3`,
      email: `SS${n}-N55lot3@radc.com`,
      employeeId: `N55LOT3-SS${n}-001`,
      role: UserRole.STORE_INCHARGE,
      isHead: false,
    };
  }),
  ...Array.from({ length: 5 }, (_, index) => {
    const n = index + 1;
    return {
      lot: "LOT3" as const,
      group: "Project Manager (Highways)",
      name: `PM Highways ${n} N55 LOT3`,
      email: `PMH${n}-N55lot3@radc.com`,
      employeeId: `N55LOT3-PMH${n}-001`,
      role: UserRole.PROJECT_MANAGER,
      isHead: false,
    };
  }),
  ...Array.from({ length: 5 }, (_, index) => {
    const n = index + 1;
    return {
      lot: "LOT3" as const,
      group: "Project Manager (Structures)",
      name: `PM Structures ${n} N55 LOT3`,
      email: `PMS${n}-N55lot3@radc.com`,
      employeeId: `N55LOT3-PMS${n}-001`,
      role: UserRole.PROJECT_MANAGER,
      isHead: false,
    };
  }),
  ...Array.from({ length: 5 }, (_, index) => {
    const n = index + 1;
    return {
      lot: "LOT3" as const,
      group: "Construction Manager (Highways)",
      name: `CM Highways ${n} N55 LOT3`,
      email: `CMH${n}.1-N55lot3@radc.com`,
      employeeId: `N55LOT3-CMH${n}-001`,
      role: UserRole.CONSTRUCTION_MANAGER,
      isHead: false,
    };
  }),
  ...Array.from({ length: 5 }, (_, index) => {
    const n = index + 1;
    return {
      lot: "LOT3" as const,
      group: "Construction Manager (Structures)",
      name: `CM Structures ${n} N55 LOT3`,
      email: `CMS${n}.1-N55lot3@radc.com`,
      employeeId: `N55LOT3-CMS${n}-001`,
      role: UserRole.CONSTRUCTION_MANAGER,
      isHead: false,
    };
  }),
];

export const LOT4_USER_SPECS: UserSpec[] = [
  {
    lot: "LOT4",
    group: "Section Accountant",
    name: "SA3 N55 LOT4 Section 3",
    email: "SA3-N55lot4-Section3@radc.com",
    employeeId: "N55LOT4-SA3-001",
    role: UserRole.ACCOUNTANT,
    isHead: false,
  },
  {
    lot: "LOT4",
    group: "Section Accountant",
    name: "SA4 N55 LOT4 Section 4",
    email: "SA4-N55lot4-Section4@radc.com",
    employeeId: "N55LOT4-SA4-001",
    role: UserRole.ACCOUNTANT,
    isHead: false,
  },
  {
    lot: "LOT4",
    group: "Site Incharge",
    name: "Site Incharge N55 LOT4",
    email: "SI-N55lot4@radc.com",
    employeeId: "N55LOT4-SI-001",
    role: UserRole.SITE_INCHARGE,
    isHead: false,
  },
  {
    lot: "LOT4",
    group: "Head Store",
    name: "Head Store N55 LOT4",
    email: "HS-N55lot4@radc.com",
    employeeId: "N55LOT4-HS-001",
    role: UserRole.STORE_INCHARGE,
    isHead: true,
  },
  ...Array.from({ length: 4 }, (_, index) => {
    const n = index + 1;
    return {
      lot: "LOT4" as const,
      group: "Section Store",
      name: `Section Store ${n} N55 LOT4`,
      email: `SS${n}-N55lot4@radc.com`,
      employeeId: `N55LOT4-SS${n}-001`,
      role: UserRole.STORE_INCHARGE,
      isHead: false,
    };
  }),
  ...Array.from({ length: 4 }, (_, index) => {
    const n = index + 1;
    return {
      lot: "LOT4" as const,
      group: "Project Manager (Highways)",
      name: `PM Highways ${n} N55 LOT4`,
      email: `PMH${n}-N55lot4@radc.com`,
      employeeId: `N55LOT4-PMH${n}-001`,
      role: UserRole.PROJECT_MANAGER,
      isHead: false,
    };
  }),
  ...Array.from({ length: 4 }, (_, index) => {
    const n = index + 1;
    return {
      lot: "LOT4" as const,
      group: "Project Manager (Structures)",
      name: `PM Structures ${n} N55 LOT4`,
      email: `PMS${n}-N55lot4@radc.com`,
      employeeId: `N55LOT4-PMS${n}-001`,
      role: UserRole.PROJECT_MANAGER,
      isHead: false,
    };
  }),
  ...Array.from({ length: 4 }, (_, index) => {
    const n = index + 1;
    return {
      lot: "LOT4" as const,
      group: "Construction Manager (Highways)",
      name: `CM Highways ${n} N55 LOT4`,
      email: `CMH${n}.1-N55lot4@radc.com`,
      employeeId: `N55LOT4-CMH${n}-001`,
      role: UserRole.CONSTRUCTION_MANAGER,
      isHead: false,
    };
  }),
  ...Array.from({ length: 4 }, (_, index) => {
    const n = index + 1;
    return {
      lot: "LOT4" as const,
      group: "Construction Manager (Structures)",
      name: `CM Structures ${n} N55 LOT4`,
      email: `CMS${n}.1-N55lot4@radc.com`,
      employeeId: `N55LOT4-CMS${n}-001`,
      role: UserRole.CONSTRUCTION_MANAGER,
      isHead: false,
    };
  }),
];
