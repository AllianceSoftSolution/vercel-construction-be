"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateEmployeeId = exports.generatePOReferenceNumber = exports.generateDemandCode = exports.generateSectionCode = exports.generateProjectCode = void 0;
const prisma_1 = __importDefault(require("./prisma"));
const generateProjectCode = async () => {
    let nextNumber = 1;
    let code;
    let exists = true;
    while (exists) {
        code = `PR${nextNumber.toString().padStart(3, "0")}`;
        const project = await prisma_1.default.project.findUnique({ where: { code } });
        if (!project) {
            exists = false;
        }
        else {
            nextNumber++;
        }
    }
    return code;
};
exports.generateProjectCode = generateProjectCode;
const generateSectionCode = async (projectId) => {
    const project = await prisma_1.default.project.findUnique({ where: { id: projectId } });
    if (!project)
        throw new Error("Project not found");
    let nextNumber = 1;
    let code;
    let exists = true;
    while (exists) {
        const sectionCode = nextNumber.toString().padStart(3, "0");
        code = `SEC-${project.code}-${sectionCode}`;
        const section = await prisma_1.default.section.findFirst({ where: { code } });
        if (!section) {
            exists = false;
        }
        else {
            nextNumber++;
        }
    }
    return code;
};
exports.generateSectionCode = generateSectionCode;
const generateDemandCode = async (projectId) => {
    const project = await prisma_1.default.project.findUnique({ where: { id: projectId } });
    if (!project)
        throw new Error("Project not found");
    let nextNumber = 1;
    let code;
    let exists = true;
    while (exists) {
        const num = nextNumber.toString().padStart(3, "0");
        code = `DEM-${project.code}-${num}`;
        const demand = await prisma_1.default.demand.findUnique({
            where: { referenceNumber: code },
        });
        if (!demand) {
            exists = false;
        }
        else {
            nextNumber++;
        }
    }
    return code;
};
exports.generateDemandCode = generateDemandCode;
const generatePOReferenceNumber = async (demandId) => {
    const demand = await prisma_1.default.demand.findUnique({
        where: { id: demandId },
        include: { section: { include: { project: true } } },
    });
    if (!demand || !demand.section || !demand.section.project)
        throw new Error("Demand, section, or project not found");
    const projectCode = demand.section.project.code;
    const sectionCode = demand.section.code.split("-").pop();
    const demandCode = demand.referenceNumber;
    let nextNumber = 1;
    let code;
    let exists = true;
    while (exists) {
        const num = nextNumber.toString().padStart(3, "0");
        code = `PO-${projectCode}-${sectionCode}-${demandCode}/${num}`;
        const po = await prisma_1.default.purchaseOrder.findUnique({
            where: { referenceNumber: code },
        });
        if (!po) {
            exists = false;
        }
        else {
            nextNumber++;
        }
    }
    return code;
};
exports.generatePOReferenceNumber = generatePOReferenceNumber;
const generateEmployeeId = async (role) => {
    const prefix = `EMP-${role.substring(0, 2).toUpperCase()}`;
    let nextNumber = 1;
    let id;
    let exists = true;
    while (exists) {
        id = `${prefix}-${nextNumber}`;
        const user = await prisma_1.default.user.findUnique({ where: { employeeId: id } });
        if (!user) {
            exists = false;
        }
        else {
            nextNumber++;
        }
    }
    return id;
};
exports.generateEmployeeId = generateEmployeeId;
if (require.main === module) {
    (async () => {
        let user = await prisma_1.default.user.findFirst();
        if (!user) {
            user = await prisma_1.default.user.create({
                data: {
                    email: "test@example.com",
                    password: "test",
                    name: "Test User",
                    employeeId: "EMP-AD-1",
                    role: "ADMIN",
                },
            });
        }
        let material = await prisma_1.default.material.findFirst();
        if (!material) {
            material = await prisma_1.default.material.create({
                data: {
                    name: "Test Material",
                    unit: "unit",
                    createdBy: user.id,
                },
            });
        }
        let vendor = await prisma_1.default.vendor.findFirst();
        if (!vendor) {
            vendor = await prisma_1.default.vendor.create({
                data: {
                    name: "Test Vendor",
                    createdBy: user.id,
                },
            });
        }
        console.log("\n--- Project Codes ---");
        for (let i = 0; i < 5; i++) {
            const code = await (0, exports.generateProjectCode)();
            console.log(code);
            await prisma_1.default.project.create({
                data: { code, name: `Project ${code}`, createdBy: user.id },
            });
        }
        const project = await prisma_1.default.project.findFirst();
        if (project) {
            console.log("\n--- Section Codes ---");
            for (let i = 0; i < 5; i++) {
                const code = await (0, exports.generateSectionCode)(project.id);
                console.log(code);
                await prisma_1.default.section.create({
                    data: {
                        code,
                        name: `Section ${code}`,
                        projectId: project.id,
                        createdBy: user.id,
                    },
                });
            }
            const section = await prisma_1.default.section.findFirst({
                where: { projectId: project.id },
            });
            if (section) {
                console.log("\n--- Demand Codes ---");
                for (let i = 0; i < 5; i++) {
                    const code = await (0, exports.generateDemandCode)(project.id);
                    console.log(code);
                    await prisma_1.default.demand.create({
                        data: {
                            referenceNumber: code,
                            sectionId: section.id,
                            materialId: material.id,
                            quantity: 1,
                            unit: "unit",
                            createdBy: user.id,
                        },
                    });
                }
                const demand = await prisma_1.default.demand.findFirst({
                    where: { sectionId: section.id },
                });
                if (demand) {
                    console.log("\n--- PO Codes ---");
                    for (let i = 0; i < 5; i++) {
                        const code = await (0, exports.generatePOReferenceNumber)(demand.id);
                        console.log(code);
                        await prisma_1.default.purchaseOrder.create({
                            data: {
                                referenceNumber: code,
                                demandId: demand.id,
                                projectId: project.id,
                                sectionId: section.id,
                                materialId: material.id,
                                vendorId: vendor.id,
                                quantity: 1,
                                createdBy: user.id,
                            },
                        });
                    }
                }
            }
        }
        process.exit(0);
    })();
}
//# sourceMappingURL=generateCode.js.map