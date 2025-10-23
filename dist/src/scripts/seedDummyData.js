"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = __importDefault(require("../utils/prisma"));
async function main() {
    const adminEmail = 'admin@example.com';
    const admin = await prisma_1.default.user.upsert({
        where: { email: adminEmail },
        update: {},
        create: {
            name: 'Admin User',
            email: adminEmail,
            password: bcryptjs_1.default.hashSync('admin123', 10),
            employeeId: 'EMP-ADMIN',
            role: client_1.UserRole.ADMIN,
            isActive: true,
            isDeleted: false,
        },
    });
    console.log('Admin:', admin.email);
    const projectData = [
        { code: 'PROJ-001', name: 'Alpha Project' },
        { code: 'PROJ-002', name: 'Beta Project' },
        { code: 'PROJ-003', name: 'Gamma Project' },
    ];
    const projects = [];
    for (const p of projectData) {
        const project = await prisma_1.default.project.upsert({
            where: { code: p.code },
            update: {},
            create: {
                name: p.name,
                code: p.code,
                description: `Description for ${p.name}`,
                isActive: true,
                isDeleted: false,
                createdBy: admin.id,
            },
        });
        projects.push(project);
    }
    console.log('Projects:', projects.map(p => p.code));
    const allSections = [];
    for (const project of projects) {
        for (let i = 1; i <= 3; i++) {
            const section = await prisma_1.default.section.upsert({
                where: { projectId_code: { projectId: project.id, code: `SEC-${i.toString().padStart(3, '0')}` } },
                update: {},
                create: {
                    name: `Section ${i} of ${project.name}`,
                    code: `SEC-${i.toString().padStart(3, '0')}`,
                    projectId: project.id,
                    isActive: true,
                    isDeleted: false,
                    createdBy: admin.id,
                },
            });
            allSections.push(section);
        }
    }
    console.log('Sections:', allSections.length);
    const siteIncharges = [];
    for (let i = 1; i <= 3; i++) {
        const user = await prisma_1.default.user.upsert({
            where: { email: `site${i}@example.com` },
            update: {},
            create: {
                name: `Site Incharge ${i}`,
                email: `site${i}@example.com`,
                password: bcryptjs_1.default.hashSync('site123', 10),
                employeeId: `EMP-SI-${i}`,
                role: client_1.UserRole.SITE_INCHARGE,
                isActive: true,
                isDeleted: false,
                createdBy: admin.id,
            },
        });
        siteIncharges.push(user);
    }
    const projectManagers = [];
    for (let i = 1; i <= 2; i++) {
        const user = await prisma_1.default.user.upsert({
            where: { email: `pm${i}@example.com` },
            update: {},
            create: {
                name: `Project Manager ${i}`,
                email: `pm${i}@example.com`,
                password: bcryptjs_1.default.hashSync('pm123', 10),
                employeeId: `EMP-PM-${i}`,
                role: client_1.UserRole.PROJECT_MANAGER,
                isActive: true,
                isDeleted: false,
                createdBy: admin.id,
            },
        });
        projectManagers.push(user);
    }
    const constructionManagers = [];
    for (let i = 1; i <= 2; i++) {
        const user = await prisma_1.default.user.upsert({
            where: { email: `cm${i}@example.com` },
            update: {},
            create: {
                name: `Construction Manager ${i}`,
                email: `cm${i}@example.com`,
                password: bcryptjs_1.default.hashSync('cm123', 10),
                employeeId: `EMP-CM-${i}`,
                role: client_1.UserRole.CONSTRUCTION_MANAGER,
                isActive: true,
                isDeleted: false,
                createdBy: admin.id,
            },
        });
        constructionManagers.push(user);
    }
    const accountants = [];
    for (let i = 1; i <= 2; i++) {
        const user = await prisma_1.default.user.upsert({
            where: { email: `accountant${i}@example.com` },
            update: {},
            create: {
                name: `Accountant ${i}`,
                email: `accountant${i}@example.com`,
                password: bcryptjs_1.default.hashSync('acc123', 10),
                employeeId: `EMP-ACC-${i}`,
                role: client_1.UserRole.ACCOUNTANT,
                isActive: true,
                isDeleted: false,
                createdBy: admin.id,
            },
        });
        accountants.push(user);
    }
    const storeIncharges = [];
    for (let i = 1; i <= 2; i++) {
        const user = await prisma_1.default.user.upsert({
            where: { email: `storeincharge${i}@example.com` },
            update: {},
            create: {
                name: `Store Incharge ${i}`,
                email: `storeincharge${i}@example.com`,
                password: bcryptjs_1.default.hashSync('store123', 10),
                employeeId: `EMP-SI-STORE-${i}`,
                role: client_1.UserRole.STORE_INCHARGE,
                isActive: true,
                isDeleted: false,
                createdBy: admin.id,
            },
        });
        storeIncharges.push(user);
    }
    for (const section of allSections.filter(s => s.projectId === projects[0].id)) {
        await prisma_1.default.siteInchargeAssignment.upsert({
            where: { userId_sectionId: { userId: siteIncharges[0].id, sectionId: section.id } },
            update: {},
            create: {
                userId: siteIncharges[0].id,
                projectId: projects[0].id,
                sectionId: section.id,
                createdBy: admin.id,
            },
        });
    }
    await prisma_1.default.siteInchargeAssignment.upsert({
        where: { userId_sectionId: { userId: siteIncharges[0].id, sectionId: allSections.find(s => s.projectId === projects[1].id && s.code === 'SEC-001').id } },
        update: {},
        create: {
            userId: siteIncharges[0].id,
            projectId: projects[1].id,
            sectionId: allSections.find(s => s.projectId === projects[1].id && s.code === 'SEC-001').id,
            createdBy: admin.id,
        },
    });
    for (const section of allSections.filter(s => s.projectId === projects[1].id)) {
        await prisma_1.default.siteInchargeAssignment.upsert({
            where: { userId_sectionId: { userId: siteIncharges[1].id, sectionId: section.id } },
            update: {},
            create: {
                userId: siteIncharges[1].id,
                projectId: projects[1].id,
                sectionId: section.id,
                createdBy: admin.id,
            },
        });
    }
    for (const section of allSections.filter(s => s.projectId === projects[2].id && (s.code === 'SEC-002' || s.code === 'SEC-003'))) {
        await prisma_1.default.siteInchargeAssignment.upsert({
            where: { userId_sectionId: { userId: siteIncharges[2].id, sectionId: section.id } },
            update: {},
            create: {
                userId: siteIncharges[2].id,
                projectId: projects[2].id,
                sectionId: section.id,
                createdBy: admin.id,
            },
        });
    }
    await prisma_1.default.projectManagerAssignment.upsert({
        where: { userId_sectionId: { userId: projectManagers[0].id, sectionId: allSections.find(s => s.projectId === projects[0].id && s.code === 'SEC-001').id } },
        update: {},
        create: {
            userId: projectManagers[0].id,
            projectId: projects[0].id,
            sectionId: allSections.find(s => s.projectId === projects[0].id && s.code === 'SEC-001').id,
            createdBy: admin.id,
        },
    });
    await prisma_1.default.projectManagerAssignment.upsert({
        where: { userId_sectionId: { userId: projectManagers[0].id, sectionId: allSections.find(s => s.projectId === projects[1].id && s.code === 'SEC-002').id } },
        update: {},
        create: {
            userId: projectManagers[0].id,
            projectId: projects[1].id,
            sectionId: allSections.find(s => s.projectId === projects[1].id && s.code === 'SEC-002').id,
            createdBy: admin.id,
        },
    });
    for (const section of allSections.filter(s => s.projectId === projects[2].id)) {
        await prisma_1.default.projectManagerAssignment.upsert({
            where: { userId_sectionId: { userId: projectManagers[1].id, sectionId: section.id } },
            update: {},
            create: {
                userId: projectManagers[1].id,
                projectId: projects[2].id,
                sectionId: section.id,
                createdBy: admin.id,
            },
        });
    }
    await prisma_1.default.constructionManagerAssignment.upsert({
        where: { userId_sectionId: { userId: constructionManagers[0].id, sectionId: allSections.find(s => s.projectId === projects[0].id && s.code === 'SEC-002').id } },
        update: {},
        create: {
            userId: constructionManagers[0].id,
            sectionId: allSections.find(s => s.projectId === projects[0].id && s.code === 'SEC-002').id,
            createdBy: admin.id,
        },
    });
    await prisma_1.default.constructionManagerAssignment.upsert({
        where: { userId_sectionId: { userId: constructionManagers[1].id, sectionId: allSections.find(s => s.projectId === projects[1].id && s.code === 'SEC-003').id } },
        update: {},
        create: {
            userId: constructionManagers[1].id,
            sectionId: allSections.find(s => s.projectId === projects[1].id && s.code === 'SEC-003').id,
            createdBy: admin.id,
        },
    });
    await prisma_1.default.constructionManagerAssignment.upsert({
        where: { userId_sectionId: { userId: constructionManagers[1].id, sectionId: allSections.find(s => s.projectId === projects[2].id && s.code === 'SEC-001').id } },
        update: {},
        create: {
            userId: constructionManagers[1].id,
            sectionId: allSections.find(s => s.projectId === projects[2].id && s.code === 'SEC-001').id,
            createdBy: admin.id,
        },
    });
    await prisma_1.default.accountantAssignment.upsert({
        where: { userId_projectId_sectionId: { userId: accountants[0].id, projectId: projects[0].id, sectionId: allSections.find(s => s.projectId === projects[0].id && s.code === 'SEC-001').id } },
        update: {},
        create: {
            userId: accountants[0].id,
            projectId: projects[0].id,
            sectionId: allSections.find(s => s.projectId === projects[0].id && s.code === 'SEC-001').id,
            createdBy: admin.id,
        },
    });
    await prisma_1.default.accountantAssignment.upsert({
        where: { userId_projectId_sectionId: { userId: accountants[1].id, projectId: projects[2].id, sectionId: allSections.find(s => s.projectId === projects[2].id && s.code === 'SEC-003').id } },
        update: {},
        create: {
            userId: accountants[1].id,
            projectId: projects[2].id,
            sectionId: allSections.find(s => s.projectId === projects[2].id && s.code === 'SEC-003').id,
            createdBy: admin.id,
        },
    });
    for (const section of allSections) {
        const headStore = await prisma_1.default.store.upsert({
            where: { id: `head-${section.id}` },
            update: {},
            create: {
                id: `head-${section.id}`,
                name: `Head Store for ${section.code}`,
                type: client_1.StoreType.HEAD_STORE,
                sectionId: section.id,
                isActive: true,
                isDeleted: false,
                createdBy: admin.id,
            },
        });
        await prisma_1.default.store.upsert({
            where: { id: `cm-${section.id}` },
            update: {},
            create: {
                id: `cm-${section.id}`,
                name: `CM Store for ${section.code}`,
                type: client_1.StoreType.CM_STORE,
                sectionId: section.id,
                isActive: true,
                isDeleted: false,
                createdBy: admin.id,
            },
        });
        const storeIncharge = storeIncharges[(parseInt(section.code.split('-')[1]) + 1) % storeIncharges.length];
        await prisma_1.default.storeInchargeAssignment.upsert({
            where: { userId_storeId: { userId: storeIncharge.id, storeId: headStore.id } },
            update: {},
            create: {
                userId: storeIncharge.id,
                storeId: headStore.id,
                createdBy: admin.id,
            },
        });
    }
    for (const project of projects) {
        let vendor = await prisma_1.default.vendor.findFirst({ where: { email: `vendor-${project.code}@example.com` } });
        if (!vendor) {
            vendor = await prisma_1.default.vendor.create({
                data: {
                    name: `Vendor for ${project.name}`,
                    contactPerson: `Contact ${project.name}`,
                    email: `vendor-${project.code}@example.com`,
                    phone: '1234567890',
                    address: `Address for ${project.name}`,
                    isActive: true,
                    isDeleted: false,
                    createdBy: admin.id,
                },
            });
        }
        await prisma_1.default.vendorAccount.upsert({
            where: { vendorId: vendor.id },
            update: {},
            create: { vendorId: vendor.id },
        });
        const material = await prisma_1.default.material.upsert({
            where: { name: `Cement for ${project.code}` },
            update: {},
            create: {
                name: `Cement for ${project.code}`,
                unit: 'Bag',
                isActive: true,
                isDeleted: false,
                createdBy: admin.id,
            },
        });
        const section = allSections.find(s => s.projectId === project.id && s.code === 'SEC-001');
        if (section) {
            const demand = await prisma_1.default.demand.upsert({
                where: { referenceNumber: `DEM-${project.code}` },
                update: {},
                create: {
                    referenceNumber: `DEM-${project.code}`,
                    materialId: material.id,
                    quantity: 100,
                    unit: 'Bag',
                    sectionId: section.id,
                    status: client_1.DemandStatus.REQUEST_SENT,
                    createdBy: constructionManagers[0].id,
                    quantityRemaining: 100,
                },
            });
            const po = await prisma_1.default.purchaseOrder.create({
                data: {
                    referenceNumber: `PO-${project.code}-001`,
                    demandId: demand.id,
                    projectId: project.id,
                    sectionId: section.id,
                    materialId: material.id,
                    vendorId: vendor.id,
                    quantity: 50,
                    unitPrice: 150.00,
                    totalAmount: 7500.00,
                    proofOfBill: 'https://example.com/bill-001.pdf',
                    amountAddedBy: siteIncharges[0].id,
                    amountAddedAt: new Date(),
                    status: 'ORDER_PLACED',
                    createdBy: siteIncharges[0].id,
                },
            });
            const vendorAccount = await prisma_1.default.vendorAccount.findUnique({
                where: { vendorId: vendor.id },
            });
            if (vendorAccount) {
                await prisma_1.default.vendorAccountTransaction.create({
                    data: {
                        vendorAccountId: vendorAccount.id,
                        type: 'CREDIT',
                        amount: 7500.00,
                        purchaseOrderId: po.id,
                        addedBy: siteIncharges[0].id,
                        proofOfPayment: 'https://example.com/bill-001.pdf',
                        note: `Credit for PO ${po.referenceNumber}`,
                    },
                });
                await prisma_1.default.vendorAccount.update({
                    where: { id: vendorAccount.id },
                    data: {
                        totalCredited: vendorAccount.totalCredited.add(7500.00),
                        balance: vendorAccount.balance.add(7500.00),
                    },
                });
            }
        }
    }
    console.log('Dummy data seeded successfully.');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma_1.default.$disconnect();
});
//# sourceMappingURL=seedDummyData.js.map