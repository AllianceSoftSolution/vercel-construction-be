import { UserRole } from "@prisma/client";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/appError";
import { generateEmployeeId } from "../utils/generateCode";
import { TRANSACTION_REFERENCES } from "../constants";
import { NotificationService } from "../utils/notificationService";
import prisma from "../utils/prisma";
const crypto = require("crypto");

// Site Incharge Assignments
const createSiteInchargeAssignment = catchAsync(async (req, res, next) => {
  const { userId, projectId, sectionIds } = req.body;
  const currentUserId = req.user.id;

  if (!userId || !projectId || !Array.isArray(sectionIds)) {
    return next(
      new AppError(
        "userId, projectId, and sectionIds (array) are required",
        400
      )
    );
  }

  // Check if user exists and has SITE_INCHARGE role
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  if (user.role !== "SITE_INCHARGE") {
    return next(new AppError("User must have SITE_INCHARGE role", 400));
  }

  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return next(new AppError("Project not found", 404));
  }

  // Get all valid sections in the project
  const validSections = await prisma.section.findMany({
    where: { projectId, id: { in: sectionIds }, isDeleted: false },
    select: { id: true },
  });
  const validSectionIds = validSections.map((s) => s.id);
  if (validSectionIds.length !== sectionIds.length) {
    return next(
      new AppError("One or more sectionIds are invalid for this project", 400)
    );
  }

  // Get all current assignments for this user in this project
  const currentAssignments = await prisma.siteInchargeAssignment.findMany({
    where: { userId, projectId, isActive: true },
    select: { id: true, sectionId: true },
  });
  const currentSectionIds = currentAssignments.map((a) => a.sectionId);

  // Sections to assign (new ones not already assigned)
  const toAssign = validSectionIds.filter(
    (id) => !currentSectionIds.includes(id)
  );
  // Sections to unassign (previously assigned but not in new list)
  const toUnassign = currentAssignments.filter(
    (a) => !validSectionIds.includes(a.sectionId)
  );

  // Assign new sections
  const createdAssignments = await Promise.all(
    toAssign.map((sectionId) =>
      prisma.siteInchargeAssignment.create({
        data: {
          userId,
          projectId,
          sectionId,
          createdBy: currentUserId,
        },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          project: { select: { id: true, name: true, code: true } },
          section: { select: { id: true, name: true, code: true } },
        },
      })
    )
  );

  // Unassign removed sections (set isActive to false)
  await Promise.all(
    toUnassign.map((a) =>
      prisma.siteInchargeAssignment.update({
        where: { id: a.id },
        data: { isActive: false },
      })
    )
  );

  res.status(201).json({
    message: "Site Incharge assignments updated successfully",
    assignedSectionIds: validSectionIds,
    createdAssignments,
    unassignedSectionIds: toUnassign.map((a) => a.sectionId),
  });
});

const getSiteInchargeAssignments = catchAsync(async (req, res) => {
  const { userId, projectId, sectionId, isActive } = req.query;

  const where: any = {};
  if (userId) {
    where.userId = userId as string;
  }
  if (projectId) {
    where.projectId = projectId as string;
  }
  if (sectionId) {
    where.sectionId = sectionId as string;
  }
  if (isActive !== undefined) {
    where.isActive = isActive === "true";
  }

  const assignments = await prisma.siteInchargeAssignment.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      section: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    message: "Site Incharge assignments retrieved successfully",
    assignments,
  });
});

// Project Manager Assignments
const createProjectManagerAssignment = catchAsync(async (req, res, next) => {
  const { userId, projectId, sectionId } = req.body;
  const currentUserId = req.user.id;

  if (!userId || !projectId || !sectionId) {
    return next(
      new AppError("UserId, projectId, and sectionId are required", 400)
    );
  }

  // Check if user exists and has PROJECT_MANAGER role
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  if (user.role !== "PROJECT_MANAGER") {
    return next(new AppError("User must have PROJECT_MANAGER role", 400));
  }

  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return next(new AppError("Project not found", 404));
  }

  // Check if section exists and belongs to the project
  const section = await prisma.section.findFirst({
    where: {
      id: sectionId,
      projectId,
    },
  });

  if (!section) {
    return next(
      new AppError("Section not found or does not belong to the project", 404)
    );
  }

  // Check if assignment already exists
  const existingAssignment = await prisma.projectManagerAssignment.findFirst({
    where: {
      userId,
      sectionId,
      isActive: true,
    },
  });

  if (existingAssignment) {
    return next(new AppError("User is already assigned to this section", 400));
  }

  const assignment = await prisma.projectManagerAssignment.create({
    data: {
      userId,
      projectId,
      sectionId,
      createdBy: currentUserId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      section: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });

  res.status(201).json({
    message: "Project Manager assignment created successfully",
    assignment,
  });
});

const getProjectManagerAssignments = catchAsync(async (req, res) => {
  const { userId, projectId, sectionId, isActive } = req.query;

  const where: any = {};
  if (userId) {
    where.userId = userId as string;
  }
  if (projectId) {
    where.projectId = projectId as string;
  }
  if (sectionId) {
    where.sectionId = sectionId as string;
  }
  if (isActive !== undefined) {
    where.isActive = isActive === "true";
  }

  const assignments = await prisma.projectManagerAssignment.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      section: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    message: "Project Manager assignments retrieved successfully",
    assignments,
  });
});

// Construction Manager Assignments
const createConstructionManagerAssignment = catchAsync(
  async (req, res, next) => {
    const { userId, sectionId } = req.body;
    const currentUserId = req.user.id;

    if (!userId || !sectionId) {
      return next(new AppError("UserId and sectionId are required", 400));
    }

    // Check if user exists and has CONSTRUCTION_MANAGER role
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return next(new AppError("User not found", 404));
    }

    if (user.role !== "CONSTRUCTION_MANAGER") {
      return next(
        new AppError("User must have CONSTRUCTION_MANAGER role", 400)
      );
    }

    // Check if section exists
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
    });

    if (!section) {
      return next(new AppError("Section not found", 404));
    }

    // Check if assignment already exists
    const existingAssignment =
      await prisma.constructionManagerAssignment.findFirst({
        where: {
          userId,
          sectionId,
          isActive: true,
        },
      });

    if (existingAssignment) {
      return next(
        new AppError("User is already assigned to this section", 400)
      );
    }

    // Ensure section has a SECTION_STORE (created automatically when first CM is assigned)
    const existingSectionStore = await prisma.store.findFirst({
      where: {
        type: "SECTION_STORE",
        sectionId,
        isDeleted: false,
      },
    });

    // Create assignment and ensure section store in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the CM assignment
      const assignment = await tx.constructionManagerAssignment.create({
        data: {
          userId,
          sectionId,
          createdBy: currentUserId,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          section: {
            select: {
              id: true,
              name: true,
              code: true,
              project: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
      });

      let sectionStore = existingSectionStore;
      if (!sectionStore) {
        sectionStore = await tx.store.create({
          data: {
            name: `Section Store - ${section.code}`,
            type: "SECTION_STORE",
            sectionId,
            createdBy: currentUserId,
          },
          include: {
            section: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        });
      }

      return { assignment, sectionStore };
    });

    res.status(201).json({
      message:
        "Construction Manager assignment and section store ensured successfully",
      assignment: result.assignment,
      sectionStore: result.sectionStore,
    });
  }
);

const getConstructionManagerAssignments = catchAsync(async (req, res) => {
  const { userId, sectionId, isActive } = req.query;

  const where: any = {};
  if (userId) {
    where.userId = userId as string;
  }
  if (sectionId) {
    where.sectionId = sectionId as string;
  }
  if (isActive !== undefined) {
    where.isActive = isActive === "true";
  }

  const assignments = await prisma.constructionManagerAssignment.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      section: {
        select: {
          id: true,
          name: true,
          code: true,
          project: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    message: "Construction Manager assignments retrieved successfully",
    assignments,
  });
});

// Store Incharge Assignments
const createStoreInchargeAssignment = catchAsync(async (req, res, next) => {
  const { userId, storeId } = req.body;
  const currentUserId = req.user.id;

  if (!userId || !storeId) {
    return next(new AppError("UserId and storeId are required", 400));
  }

  // Check if user exists and has STORE_INCHARGE role
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  if (user.role !== "STORE_INCHARGE") {
    return next(new AppError("User must have STORE_INCHARGE role", 400));
  }

  // Check if store exists
  const store = await prisma.store.findUnique({
    where: { id: storeId },
  });

  if (!store) {
    return next(new AppError("Store not found", 404));
  }

  // Check if assignment already exists
  const existingAssignment = await prisma.storeInchargeAssignment.findFirst({
    where: {
      userId,
      storeId,
      isActive: true,
    },
  });

  if (existingAssignment) {
    return next(new AppError("User is already assigned to this store", 400));
  }

  const assignment = await prisma.storeInchargeAssignment.create({
    data: {
      userId,
      storeId,
      createdBy: currentUserId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      store: {
        select: {
          id: true,
          name: true,
          type: true,
          section: {
            select: {
              id: true,
              name: true,
              code: true,
              project: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
      },
    },
  });

  res.status(201).json({
    message: "Store Incharge assignment created successfully",
    assignment,
  });

  // Use the new notification service for comprehensive notifications
  await NotificationService.notifyUserAssignment({
    userId: assignment.userId,
    sectionId: assignment.store.section?.id ?? "",
    role: "STORE_INCHARGE",
    assignedBy: currentUserId,
  });
});

const getStoreInchargeAssignments = catchAsync(async (req, res) => {
  const { userId, storeId, isActive } = req.query;

  const where: any = {};
  if (userId) {
    where.userId = userId as string;
  }
  if (storeId) {
    where.storeId = storeId as string;
  }
  if (isActive !== undefined) {
    where.isActive = isActive === "true";
  }

  const assignments = await prisma.storeInchargeAssignment.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      store: {
        select: {
          id: true,
          name: true,
          type: true,
          section: {
            select: {
              id: true,
              name: true,
              code: true,
              project: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    message: "Store Incharge assignments retrieved successfully",
    assignments,
  });
});

// Accountant Assignments
const createAccountantAssignment = catchAsync(async (req, res, next) => {
  const { userId, projectId, sectionIds } = req.body;
  const currentUserId = req.user.id;

  if (!userId || !projectId || !Array.isArray(sectionIds)) {
    return next(
      new AppError(
        "userId, projectId, and sectionIds (array) are required",
        400
      )
    );
  }

  // Check if user exists and has ACCOUNTANT role
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  if (user.role !== "ACCOUNTANT") {
    return next(new AppError("User must have ACCOUNTANT role", 400));
  }

  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return next(new AppError("Project not found", 404));
  }

  // Get all valid sections in the project
  const validSections = await prisma.section.findMany({
    where: { projectId, id: { in: sectionIds }, isDeleted: false },
    select: { id: true },
  });
  const validSectionIds = validSections.map((s) => s.id);
  if (validSectionIds.length !== sectionIds.length) {
    return next(
      new AppError("One or more sectionIds are invalid for this project", 400)
    );
  }

  // Get all current assignments for this user in this project
  const currentAssignments = await prisma.accountantAssignment.findMany({
    where: { userId, projectId, isActive: true },
    select: { id: true, sectionId: true },
  });
  const currentSectionIds = currentAssignments.map((a) => a.sectionId);

  // Sections to assign (new ones not already assigned)
  const toAssign = validSectionIds.filter(
    (id) => !currentSectionIds.includes(id)
  );
  // Sections to unassign (previously assigned but not in new list)
  const toUnassign = currentAssignments.filter(
    (a) => !validSectionIds.includes(a.sectionId)
  );

  // Assign new sections
  const createdAssignments = await Promise.all(
    toAssign.map((sectionId) =>
      prisma.accountantAssignment.create({
        data: {
          userId,
          projectId,
          sectionId,
          createdBy: currentUserId,
        },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          project: { select: { id: true, name: true, code: true } },
          section: { select: { id: true, name: true, code: true } },
        },
      })
    )
  );

  // Unassign removed sections (set isActive to false)
  await Promise.all(
    toUnassign.map((a) =>
      prisma.accountantAssignment.update({
        where: { id: a.id },
        data: { isActive: false },
      })
    )
  );

  res.status(201).json({
    message: "Accountant assignments updated successfully",
    assignedSectionIds: validSectionIds,
    createdAssignments,
    unassignedSectionIds: toUnassign.map((a) => a.sectionId),
  });
});

const getAccountantAssignments = catchAsync(async (req, res) => {
  const { userId, projectId, sectionId, isActive } = req.query;

  const where: any = {};
  if (userId) {
    where.userId = userId as string;
  }
  if (projectId) {
    where.projectId = projectId as string;
  }
  if (sectionId) {
    where.sectionId = sectionId as string;
  }
  if (isActive !== undefined) {
    where.isActive = isActive === "true";
  }

  const assignments = await prisma.accountantAssignment.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      section: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    message: "Accountant assignments retrieved successfully",
    assignments,
  });
});

// Generic assignment deactivation
const deactivateAssignment = catchAsync(async (req, res, next) => {
  const { id, type } = req.params;
  const currentUserId = req.user.id;

  if (!type) {
    return next(new AppError("Assignment type is required", 400));
  }

  let assignment;
  let model;

  switch (type) {
    case "site-incharge":
      model = prisma.siteInchargeAssignment;
      break;
    case "project-manager":
      model = prisma.projectManagerAssignment;
      break;
    case "construction-manager":
      model = prisma.constructionManagerAssignment;
      break;
    case "store-incharge":
      model = prisma.storeInchargeAssignment;
      break;
    case "accountant":
      model = prisma.accountantAssignment;
      break;
    default:
      return next(new AppError("Invalid assignment type", 400));
  }

  const existing = await model.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Assignment not found", 404));
  }

  // For construction manager assignments, also handle CM store cleanup
  if (type === "construction-manager") {
    const result = await prisma.$transaction(async (tx) => {
      // Deactivate the assignment
      const updatedAssignment = await tx.constructionManagerAssignment.update({
        where: { id },
        data: {
          isActive: false,
        },
      });

      // Find the CM store associated with this assignment
      const cmStore = await tx.store.findFirst({
        where: {
          type: "CM_STORE",
          cmUserId: existing.userId,
          sectionId: existing.sectionId,
          isDeleted: false,
        },
        include: {
          inventory: {
            include: {
              material: {
                select: {
                  id: true,
                  name: true,
                  unit: true,
                },
              },
            },
          },
        },
      });

      if (cmStore) {
        // Find the head store in the same section
        const headStore = await tx.store.findFirst({
          where: {
            type: "HEAD_STORE",
            sectionId: existing.sectionId,
            isDeleted: false,
            isActive: true,
          },
        });

        // Transfer stock from CM store to head store if there's stock
        if (cmStore.inventory && cmStore.inventory.length > 0 && headStore) {
          for (const inventoryItem of cmStore.inventory) {
            if (Number(inventoryItem.stock) > 0) {
              // Transfer stock to head store
              await tx.storeInventory.upsert({
                where: {
                  storeId_materialId: {
                    storeId: headStore.id,
                    materialId: inventoryItem.materialId,
                  },
                },
                update: {
                  stock: {
                    increment: inventoryItem.stock,
                  },
                  available: {
                    increment: inventoryItem.stock,
                  },
                },
                create: {
                  storeId: headStore.id,
                  materialId: inventoryItem.materialId,
                  stock: inventoryItem.stock,
                  available: inventoryItem.stock,
                  reserved: 0,
                },
              });

              // Create transaction record for the transfer
              await tx.storeTransaction.create({
                data: {
                  storeId: headStore.id,
                  materialId: inventoryItem.materialId,
                  type: "IN",
                  quantity: inventoryItem.stock,
                  reference: TRANSACTION_REFERENCES.CM_DEACTIVATION_TRANSFER,
                  notes: `Stock transferred from deactivated CM store (${cmStore.name})`,
                  createdBy: currentUserId,
                },
              });

              // Clear the CM store inventory
              await tx.storeInventory.update({
                where: {
                  storeId_materialId: {
                    storeId: cmStore.id,
                    materialId: inventoryItem.materialId,
                  },
                },
                data: {
                  stock: 0,
                  available: 0,
                  reserved: 0,
                },
              });
            }
          }
        }

        // Deactivate the CM store
        await tx.store.update({
          where: { id: cmStore.id },
          data: {
            isActive: false,
            isDeleted: true,
            updatedBy: currentUserId,
            updatedAt: new Date(),
          },
        });
      }

      return { assignment: updatedAssignment, cmStore };
    });

    res.json({
      message:
        "Construction Manager assignment and CM store deactivated successfully. Any remaining stock has been transferred to the head store.",
      assignment: result.assignment,
      cmStore: result.cmStore,
    });
  } else {
    // For other assignment types, just deactivate the assignment
    assignment = await model.update({
      where: { id },
      data: {
        isActive: false,
        updatedBy: currentUserId,
      },
    });

    res.json({
      message: "Assignment deactivated successfully",
      assignment,
    });
  }
});

// Create and assign a new Project Manager to a section in a project
const createAndAssignProjectManager = catchAsync(async (req, res, next) => {
  const { name, email, projectId, sectionId } = req.body;
  const currentUserId = req.user.id;

  if (!name || !email || !projectId || !sectionId) {
    return next(new AppError("All fields are required", 400));
  }

  // Check if user/email already exists
  const existingUser = await prisma.user.findFirst({
    where: { email },
  });
  if (existingUser) {
    return next(new AppError("User with this email already exists", 400));
  }

  // Generate employee ID automatically
  const employeeId = await generateEmployeeId("PROJECT_MANAGER");

  // Generate random password
  const plainPassword = crypto.randomBytes(8).toString("base64");
  console.log(`Generated password for user ${email}: ${plainPassword}`);
  const hashedPassword = require("bcryptjs").hashSync(plainPassword, 10);

  // Create user
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      employeeId,
      role: "PROJECT_MANAGER",
      createdBy: currentUserId,
    },
  });

  // Assign to section/project
  const assignment = await prisma.projectManagerAssignment.create({
    data: {
      userId: user.id,
      projectId,
      sectionId,
      createdBy: currentUserId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          employeeId: true,
        },
      },
      project: { select: { id: true, name: true, code: true } },
      section: { select: { id: true, name: true, code: true } },
    },
  });

  res.status(201).json({
    message: "Project Manager created and assigned successfully",
    user,
    assignment,
  });
});

// List users by role, with projectId logic for assignment
const getUsersByRoleForAssignment = catchAsync(async (req, res, next) => {
  const { role, projectId } = req.query;
  if (!role) {
    return next(new AppError("Role is required", 400));
  }

  // Get all users with the role
  let users = await prisma.user.findMany({
    where: { role: role as UserRole, isActive: true, isDeleted: false },
    select: { id: true, name: true, email: true, employeeId: true },
  });

  if (role === "PROJECT_MANAGER" || role === "CONSTRUCTION_MANAGER") {
    if (projectId) {
      // Get users already assigned to this project
      const assigned = await prisma.projectManagerAssignment.findMany({
        where: { projectId: projectId as string, isActive: true },
        select: { userId: true },
      });
      const assignedIds = new Set(assigned.map((a) => a.userId));
      // Users not assigned to any project
      const neverAssigned = users.filter(async (u) => {
        const count = await prisma.projectManagerAssignment.count({
          where: { userId: u.id, isActive: true },
        });
        return count === 0;
      });
      // Users assigned to this project
      const assignedToThisProject = users.filter((u) => assignedIds.has(u.id));
      users = [
        ...assignedToThisProject,
        ...neverAssigned.filter((u) => !assignedIds.has(u.id)),
      ];
    } else {
      // Only users not assigned to any project
      users = await Promise.all(
        users.filter(async (u) => {
          const count = await prisma.projectManagerAssignment.count({
            where: { userId: u.id, isActive: true },
          });
          return count === 0;
        })
      );
    }
  } else if (role === "STORE_INCHARGE" || role === "ACCOUNTANT") {
    // For these roles, just return all users of that role (optionally filter by projectId for accountants)
    // For ACCOUNTANT, if projectId is provided, return all accountants (assigned or not) for that project
    // For STORE_INCHARGE, always return all store incharges
    // (No filtering needed)
  }
  // For other roles, just return all users of that role

  res.json({
    message: "Users retrieved successfully",
    users,
  });
});

// List sections in a project with isAssigned for a site incharge
const getSectionsWithSiteInchargeAssignmentStatus = catchAsync(
  async (req, res, next) => {
    const { projectId, userId } = req.query;
    if (!projectId || !userId) {
      return next(new AppError("projectId and userId are required", 400));
    }

    // Get all sections in the project
    const sections = await prisma.section.findMany({
      where: { projectId: projectId as string, isDeleted: false },
      select: { id: true, name: true, code: true, description: true },
    });

    // Get all assignments for this user in this project
    const userAssignments = await prisma.siteInchargeAssignment.findMany({
      where: {
        userId: userId as string,
        projectId: projectId as string,
        isActive: true,
      },
      select: { sectionId: true },
    });
    const assignedSectionIds = new Set(userAssignments.map((a) => a.sectionId));

    // Get all assignments for other site incharges in this project
    const otherAssignments = await prisma.siteInchargeAssignment.findMany({
      where: {
        projectId: projectId as string,
        isActive: true,
        NOT: { userId: userId as string },
      },
      select: { sectionId: true },
    });
    const otherAssignedSectionIds = new Set(
      otherAssignments.map((a) => a.sectionId)
    );

    // Add isAssigned, assignedToCurrentUser, assignedToOther fields
    const result = sections.map((section) => ({
      ...section,
      isAssigned: assignedSectionIds.has(section.id),
      assignedToCurrentUser: assignedSectionIds.has(section.id),
      assignedToOther: otherAssignedSectionIds.has(section.id),
    }));

    res.json({
      message: "Sections with assignment status retrieved successfully",
      sections: result,
    });
  }
);

// List sections in a project with isAssigned for an accountant
const getSectionsWithAccountantAssignmentStatus = catchAsync(
  async (req, res, next) => {
    const { projectId, userId } = req.query;
    if (!projectId || !userId) {
      return next(new AppError("projectId and userId are required", 400));
    }

    // Get all sections in the project
    const sections = await prisma.section.findMany({
      where: { projectId: projectId as string, isDeleted: false },
      select: { id: true, name: true, code: true, description: true },
    });

    // Get all assignments for this user in this project
    const userAssignments = await prisma.accountantAssignment.findMany({
      where: {
        userId: userId as string,
        projectId: projectId as string,
        isActive: true,
      },
      select: { sectionId: true },
    });
    const assignedSectionIds = new Set(userAssignments.map((a) => a.sectionId));

    // Get all assignments for other accountants in this project
    const otherAssignments = await prisma.accountantAssignment.findMany({
      where: {
        projectId: projectId as string,
        isActive: true,
        NOT: { userId: userId as string },
      },
      select: { sectionId: true },
    });
    const otherAssignedSectionIds = new Set(
      otherAssignments.map((a) => a.sectionId)
    );

    // Add assignedToCurrentUser and assignedToOther fields
    const result = sections.map((section) => ({
      ...section,
      assignedToCurrentUser: assignedSectionIds.has(section.id),
      assignedToOther: otherAssignedSectionIds.has(section.id),
    }));

    res.json({
      message: "Sections with assignment status retrieved successfully",
      sections: result,
    });
  }
);

export {
  createSiteInchargeAssignment,
  getSiteInchargeAssignments,
  createProjectManagerAssignment,
  getProjectManagerAssignments,
  createConstructionManagerAssignment,
  getConstructionManagerAssignments,
  createStoreInchargeAssignment,
  getStoreInchargeAssignments,
  createAccountantAssignment,
  getAccountantAssignments,
  deactivateAssignment,
  createAndAssignProjectManager,
  getUsersByRoleForAssignment,
  getSectionsWithSiteInchargeAssignmentStatus,
  getSectionsWithAccountantAssignmentStatus,
};
