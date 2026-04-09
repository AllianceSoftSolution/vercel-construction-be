import catchAsync from "../utils/catchAsync";
import AppError from "../utils/appError";
import { generateProjectCode } from "../utils/generateCode";
import {
  buildQueryOptions,
  extractQueryParams,
  buildPaginationMeta,
} from "../utils/buildQueryOptions";
import { sendNotificationToUserSafe } from "../utils/notification";
import prisma from "../utils/prisma";

const createProject = catchAsync(async (req, res, next) => {
  const { name, description, startDate, endDate, code } = req.body;
  const userId = req.user.id;

  if (!name) {
    return next(new AppError("Name is required", 400));
  }

  let projectCode: string;

  // If code is provided, validate it's unique
  if (code) {
    // Check if the provided code already exists
    const existingProject = await prisma.project.findUnique({
      where: { code },
    });

    if (existingProject) {
      return next(new AppError("Project code already exists", 400));
    }

    projectCode = code;
  } else {
    // Generate automatic project code if not provided
    projectCode = await generateProjectCode();
  }

  const project = await prisma.project.create({
    data: {
      name,
      code: projectCode,
      description,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      createdBy: userId,
    },
    include: {
      sections: {
        where: { isDeleted: false },
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
        },
      },
    },
  });

  res.status(201).json({
    message: "Project created successfully",
    project,
  });
  await sendNotificationToUserSafe({
    userId,
    title: "Project Created",
    body: `Project ${project.name} was created successfully.`,
  });
});

const getProjects = catchAsync(async (req, res) => {
  const user = req.user;

  // Extract query parameters
  const filterOptions = extractQueryParams(req);

  // Define searchable fields for projects
  const searchableFields = ["name", "code", "description"];

  // Build default filters
  let defaultFilters: any = { isDeleted: false };

  // Role-based filtering for projects
  let assignedSectionIds: string[] = [];
  if (user.role === "ADMIN") {
    // No filter, see all
  } else if (user.role === "SITE_INCHARGE") {
    const assignments = await prisma.siteInchargeAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { projectId: true, sectionId: true },
    });
    const projectIds = assignments.map((a) => a.projectId);
    assignedSectionIds = assignments.map((a) => a.sectionId);
    defaultFilters.id = { in: projectIds };
  } else if (user.role === "PROJECT_MANAGER") {
    const assignments = await prisma.projectManagerAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { projectId: true, sectionId: true },
    });
    const projectIds = assignments.map((a) => a.projectId);
    assignedSectionIds = assignments.map((a) => a.sectionId);
    defaultFilters.id = { in: projectIds };
  } else if (user.role === "CONSTRUCTION_MANAGER") {
    const assignments = await prisma.constructionManagerAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { section: { select: { projectId: true, id: true } } },
    });
    const projectIds = assignments.map((a) => a.section.projectId);
    assignedSectionIds = assignments.map((a) => a.section.id);
    defaultFilters.id = { in: projectIds };
  } else if (user.role === "STORE_INCHARGE") {
    const assignments = await prisma.storeInchargeAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: {
        store: {
          select: { section: { select: { projectId: true, id: true } } },
        },
      },
    });
    const projectIds = assignments
      .filter((a) => a.store.section != null)
      .map((a) => a.store.section!.projectId);
    assignedSectionIds = assignments
      .filter((a) => a.store.section != null)
      .map((a) => a.store.section!.id);
    defaultFilters.id = { in: projectIds };
  } else if (user.role === "ACCOUNTANT") {
    if (user.isHead) {
      // Head Accountant sees all projects — no filter
    } else {
      // Section Accountant: only assigned projects
      const assignments = await prisma.accountantAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { projectId: true, sectionId: true },
      });
      const projectIds = [...new Set(assignments.map((a) => a.projectId))];
      assignedSectionIds = assignments.map((a) => a.sectionId);
      defaultFilters.id = { in: projectIds };
    }
  }

  // Build query options
  const queryOptions = buildQueryOptions(
    filterOptions,
    defaultFilters,
    searchableFields
  );

  // Get total count for pagination
  const total = await prisma.project.count({
    where: queryOptions.where,
  });

  // Get projects with pagination
  const projects = await prisma.project.findMany({
    ...queryOptions,
    include: {
      sections: {
        where: { isDeleted: false },
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
        },
      },

      _count: {
        select: {
          sections: true,
        },
      },
    },
  });

  // Calculate total amounts for each project and section
  const projectsWithAmounts = await Promise.all(
    projects.map(async (project) => {
      // Get total amount spent on POs for this project
      const projectPOs = await prisma.purchaseOrder.aggregate({
        where: {
          projectId: project.id,
          isDeleted: false,
          totalAmount: { not: null },
        },
        _sum: {
          totalAmount: true,
        },
      });

      // Get amounts for each section
      const sectionsWithAmounts = await Promise.all(
        project.sections.map(async (section) => {
          const sectionPOs = await prisma.purchaseOrder.aggregate({
            where: {
              sectionId: section.id,
              isDeleted: false,
              totalAmount: { not: null },
            },
            _sum: {
              totalAmount: true,
            },
          });

          return {
            ...section,
            totalAmountSpent: sectionPOs._sum.totalAmount || 0,
          };
        })
      );

      return {
        ...project,
        sections: sectionsWithAmounts,
        totalAmountSpent: projectPOs._sum.totalAmount || 0,
      };
    })
  );

  // Filter sections per project based on role/assignments
  const filteredProjects = projectsWithAmounts.map((project) => {
    let filteredSections = project.sections;
    if (user.role !== "ADMIN" && Array.isArray(filteredSections)) {
      // Only keep sections with required properties
      filteredSections = filteredSections
        .filter(
          (section) =>
            section &&
            typeof section === "object" &&
            "id" in section &&
            "name" in section &&
            "code" in section
        )
        .filter((section) => assignedSectionIds.includes((section as any).id));
    }
    return {
      ...project,
      sections: filteredSections,
    };
  });

  // Build pagination metadata
  const paginationMeta = buildPaginationMeta(
    total,
    filterOptions.page || 1,
    filterOptions.limit || 50
  );

  res.json({
    message: "Projects retrieved successfully",
    projects: filteredProjects,
    ...paginationMeta,
  });
});

const getProjectById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const user = req.user;

  // Determine assignedSectionIds for the user (same logic as getProjects)
  let assignedSectionIds: string[] = [];
  if (user.role === "ADMIN") {
    // No filter, see all
  } else if (user.role === "SITE_INCHARGE") {
    const assignments = await prisma.siteInchargeAssignment.findMany({
      where: { userId: user.id, isActive: true, projectId: id },
      select: { sectionId: true },
    });
    assignedSectionIds = assignments.map((a) => a.sectionId);
  } else if (user.role === "PROJECT_MANAGER") {
    const assignments = await prisma.projectManagerAssignment.findMany({
      where: { userId: user.id, isActive: true, projectId: id },
      select: { sectionId: true },
    });
    assignedSectionIds = assignments.map((a) => a.sectionId);
  } else if (user.role === "CONSTRUCTION_MANAGER") {
    const assignments = await prisma.constructionManagerAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { section: { select: { projectId: true, id: true } } },
    });
    assignedSectionIds = assignments
      .filter((a) => a.section.projectId === id)
      .map((a) => a.section.id);
  } else if (user.role === "STORE_INCHARGE") {
    const assignments = await prisma.storeInchargeAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: {
        store: {
          select: { section: { select: { projectId: true, id: true } } },
        },
      },
    });
    assignedSectionIds = assignments
      .filter((a) => a.store.section?.projectId === id)
      .map((a) => a.store.section!.id);
  } else if (user.role === "ACCOUNTANT") {
    // If user is head accountant, they can see all projects and sections
    if (user.isHead) {
      // No filter, see all sections
    } else {
      // Regular accountant - only assigned sections
      const assignments = await prisma.accountantAssignment.findMany({
        where: { userId: user.id, isActive: true, projectId: id },
        select: { sectionId: true },
      });
      assignedSectionIds = assignments.map((a) => a.sectionId);
    }
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      sections: {
        where: { isDeleted: false },
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
          isActive: true,
          createdAt: true,
          stores: {
            where: { isDeleted: false },
            select: {
              id: true,
              name: true,
              type: true,
              isActive: true,
              cmUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                },
              },
              storeInchargeAssignments: {
                where: { isActive: true },
                select: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                      role: true,
                    },
                  },
                },
              },
            },
          },
          constructionManagerAssignments: {
            where: { isActive: true },
            select: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                },
              },
            },
          },
        },
      },
      siteInchargeAssignments: {
        where: { isActive: true },
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
            },
          },
        },
      },
      projectManagerAssignments: {
        where: { isActive: true },
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
            },
          },
        },
      },
      accountantAssignments: {
        where: { isActive: true },
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
            },
          },
        },
      },
    },
  });

  if (!project) {
    return next(new AppError("Project not found", 404));
  }

  // Calculate total amount spent on POs for this project
  const projectPOs = await prisma.purchaseOrder.aggregate({
    where: {
      projectId: project.id,
      isDeleted: false,
      totalAmount: { not: null },
    },
    _sum: {
      totalAmount: true,
    },
  });

  // Calculate amounts for each section
  let sectionsWithAmounts = await Promise.all(
    project.sections.map(async (section) => {
      const sectionPOs = await prisma.purchaseOrder.aggregate({
        where: {
          sectionId: section.id,
          isDeleted: false,
          totalAmount: { not: null },
        },
        _sum: {
          totalAmount: true,
        },
      });

      return {
        ...section,
        totalAmountSpent: sectionPOs._sum.totalAmount || 0,
      };
    })
  );

  // Filter sections for non-admins to only assigned sections
  if (user.role !== "ADMIN" && Array.isArray(sectionsWithAmounts)) {
    // If user is head accountant, they can see all sections
    if (user.role === "ACCOUNTANT" && user.isHead) {
      // No filtering needed for head accountants
    } else {
      // Filter sections for regular users (including regular accountants)
      sectionsWithAmounts = sectionsWithAmounts.filter((section) =>
        assignedSectionIds.includes(section.id)
      );
    }
  }

  // Get material caps for all sections in this project
  const projectMaterialCaps = await prisma.materialCap.findMany({
    where: {
      projectId: project.id,
      isDeleted: false,
    },
    include: {
      material: {
        select: {
          id: true,
          name: true,
          unit: true,
          category: true,
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

  // Get all demands for this project
  const projectDemands = await prisma.demand.findMany({
    where: {
      section: {
        projectId: project.id,
      },
      isDeleted: false,
    },
    select: {
      materialId: true,
      quantity: true,
      unit: true,
      status: true,
      sectionId: true,
    },
  });

  // Get all purchase orders for this project
  const projectPurchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      projectId: project.id,
      isDeleted: false,
    },
    select: {
      materialId: true,
      quantity: true,
      status: true,
      sectionId: true,
    },
  });

  // Aggregate material caps by material across all sections
  const aggregatedMaterialCaps = projectMaterialCaps.reduce(
    (acc: any[], cap) => {
      const materialId = cap.materialId;
      const existingCap = acc.find((c) => c.materialId === materialId);

      if (existingCap) {
        existingCap.totalCapQuantity += Number(cap.quantity);
        existingCap.sections.push({
          sectionId: cap.section.id,
          sectionName: cap.section.name,
          sectionCode: cap.section.code,
          capQuantity: Number(cap.quantity),
        });
      } else {
        acc.push({
          materialId: cap.materialId,
          materialName: cap.material.name,
          materialUnit: cap.material.unit,
          materialCategory: cap.material.category,
          totalCapQuantity: Number(cap.quantity),
          sections: [
            {
              sectionId: cap.section.id,
              sectionName: cap.section.name,
              sectionCode: cap.section.code,
              capQuantity: Number(cap.quantity),
            },
          ],
        });
      }

      return acc;
    },
    []
  );

  // Calculate analytics for each aggregated material cap
  const materialCapAnalytics = aggregatedMaterialCaps.map((cap) => {
    // Calculate total demand quantity for this material across all sections
    const materialDemands = projectDemands.filter(
      (d) => d.materialId === cap.materialId
    );
    const totalDemandQuantity = materialDemands.reduce(
      (sum, demand) => sum + Number(demand.quantity),
      0
    );

    // Calculate total PO quantity for this material across all sections
    const materialPOs = projectPurchaseOrders.filter(
      (po) => po.materialId === cap.materialId
    );
    const totalPOQuantity = materialPOs.reduce(
      (sum, po) => sum + Number(po.quantity),
      0
    );

    // Calculate if cap is exceeded
    const isCapExceeded = totalDemandQuantity > cap.totalCapQuantity;
    const isPOExceeded = totalPOQuantity > cap.totalCapQuantity;
    const isInLimit = !isCapExceeded && !isPOExceeded;

    // Calculate usage percentage
    const demandUsagePercentage =
      cap.totalCapQuantity > 0
        ? (totalDemandQuantity / cap.totalCapQuantity) * 100
        : 0;
    const poUsagePercentage =
      cap.totalCapQuantity > 0
        ? (totalPOQuantity / cap.totalCapQuantity) * 100
        : 0;

    return {
      materialId: cap.materialId,
      materialName: cap.materialName,
      materialUnit: cap.materialUnit,
      materialCategory: cap.materialCategory,
      totalCapQuantity: cap.totalCapQuantity,
      capUnit: cap.materialUnit,
      totalDemandQuantity: totalDemandQuantity,
      totalPurchaseOrderQuantity: totalPOQuantity,
      isDemandCapExceeded: isCapExceeded,
      isPurchaseOrderCapExceeded: isPOExceeded,
      isWithinLimit: isInLimit,
      demandUsagePercentage: Math.round(demandUsagePercentage * 100) / 100,
      purchaseOrderUsagePercentage: Math.round(poUsagePercentage * 100) / 100,
      remainingQuantity:
        cap.totalCapQuantity - Math.max(totalDemandQuantity, totalPOQuantity),
      status: isCapExceeded
        ? "EXCEEDED"
        : isPOExceeded
        ? "PO_EXCEEDED"
        : "WITHIN_LIMIT",
      sections: cap.sections,
    };
  });

  // --- Build associatedMembers with all roles and RBAC filtering ---
  const allMembers = new Map();

  // Helper to add member if not present, and push assignment
  function addMember(user, assignment) {
    if (!allMembers.has(user.id)) {
      allMembers.set(user.id, {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        assignments: [],
      });
    }
    allMembers.get(user.id).assignments.push(assignment);
  }

  // Site Incharges
  project.siteInchargeAssignments.forEach((assignment) => {
    if (
      user.role === "ADMIN" ||
      (user.role === "ACCOUNTANT" && user.isHead) ||
      assignedSectionIds.includes(assignment.section.id)
    ) {
      addMember(assignment.user, {
        type: "Site Incharge",
        section: assignment.section,
      });
    }
  });

  // Project Managers
  project.projectManagerAssignments.forEach((assignment) => {
    if (
      user.role === "ADMIN" ||
      (user.role === "ACCOUNTANT" && user.isHead) ||
      assignedSectionIds.includes(assignment.section.id)
    ) {
      addMember(assignment.user, {
        type: "Project Manager",
        section: assignment.section,
      });
    }
  });

  // Accountants
  project.accountantAssignments.forEach((assignment) => {
    if (
      user.role === "ADMIN" ||
      (user.role === "ACCOUNTANT" && user.isHead) ||
      assignedSectionIds.includes(assignment.section.id)
    ) {
      addMember(assignment.user, {
        type: "Accountant",
        section: assignment.section,
      });
    }
  });

  // Construction Managers (from each section)
  project.sections.forEach((section) => {
    if (
      user.role === "ADMIN" ||
      (user.role === "ACCOUNTANT" && user.isHead) ||
      assignedSectionIds.includes(section.id)
    ) {
      section.constructionManagerAssignments.forEach((cmAssignment) => {
        addMember(cmAssignment.user, {
          type: "Construction Manager",
          section: { id: section.id, name: section.name, code: section.code },
        });
      });
    }
  });

  // Store Incharges (from each store in each section)
  project.sections.forEach((section) => {
    if (
      user.role === "ADMIN" ||
      (user.role === "ACCOUNTANT" && user.isHead) ||
      assignedSectionIds.includes(section.id)
    ) {
      section.stores.forEach((store) => {
        store.storeInchargeAssignments.forEach((siAssignment) => {
          addMember(siAssignment.user, {
            type: "Store Incharge",
            store: { id: store.id, name: store.name, type: store.type },
            section: { id: section.id, name: section.name, code: section.code },
          });
        });
      });
    }
  });

  const associatedMembers = Array.from(allMembers.values());

  // --- End associatedMembers build ---

  // Group site incharges by user
  const siteInchargeMap = new Map();
  project.siteInchargeAssignments.forEach((assignment) => {
    const userId = assignment.user.id;
    if (!siteInchargeMap.has(userId)) {
      siteInchargeMap.set(userId, {
        id: assignment.user.id,
        name: assignment.user.name,
        email: assignment.user.email,
        role: assignment.user.role,
        sections: [],
      });
    }
    siteInchargeMap.get(userId).sections.push(assignment.section);
  });
  const assignedSiteIncharges = Array.from(siteInchargeMap.values());

  // Group accountants by user
  const accountantMap = new Map();
  project.accountantAssignments.forEach((assignment) => {
    const userId = assignment.user.id;
    if (!accountantMap.has(userId)) {
      accountantMap.set(userId, {
        id: assignment.user.id,
        name: assignment.user.name,
        email: assignment.user.email,
        role: assignment.user.role,
        sections: [],
      });
    }
    accountantMap.get(userId).sections.push(assignment.section);
  });
  const assignedAccountants = Array.from(accountantMap.values());

  // Prepare the response
  const response = {
    id: project.id,
    name: project.name,
    code: project.code,
    description: project.description,
    startDate: project.startDate,
    endDate: project.endDate,
    isActive: project.isActive,
    isDeleted: project.isDeleted,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    createdBy: project.createdBy,
    updatedBy: project.updatedBy,
    sections: sectionsWithAmounts,
    assignedSiteIncharges: assignedSiteIncharges,
    assignedAccountants: assignedAccountants,
    associatedMembers: associatedMembers,
    totalAmountSpent: projectPOs._sum.totalAmount || 0,
    materialCapAnalytics: materialCapAnalytics,
  };

  res.json({
    message: "Project retrieved successfully",
    project: response,
  });
});

const updateProject = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const updates = { ...req.body };
  const userId = req.user.id;

  // Remove fields that shouldn't be updated directly
  delete updates.id;
  delete updates.createdAt;
  delete updates.createdBy;
  // Removed the line that deleted updates.code to allow code updates

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Project not found", 404));
  }

  // If code is being updated, validate it's unique
  if (updates.code && updates.code !== existing.code) {
    // Check if the new code already exists
    const existingProjectWithCode = await prisma.project.findUnique({
      where: { code: updates.code },
    });

    if (existingProjectWithCode) {
      return next(new AppError("Project code already exists", 400));
    }
  }

  // Convert date strings to Date objects
  if (updates.startDate) {
    updates.startDate = new Date(updates.startDate);
  }
  if (updates.endDate) {
    updates.endDate = new Date(updates.endDate);
  }

  const updatedProject = await prisma.project.update({
    where: { id },
    data: {
      ...updates,
      updatedBy: userId,
      updatedAt: new Date(),
    },
    include: {
      sections: {
        where: { isDeleted: false },
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
        },
      },
    },
  });

  res.json({
    message: "Project updated successfully",
    project: updatedProject,
  });

  // Send notification to the user who updated the project
  await sendNotificationToUserSafe({
    userId,
    title: "Project Updated",
    body: `Project ${updatedProject.name} was updated successfully.`,
  });
});

const deleteProject = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;

  const existing = await prisma.project.findUnique({
    where: { id },
    include: { sections: true },
  });
  if (!existing) {
    return next(new AppError("Project not found", 404));
  }

  // For each section in the project, delete all assignments and store incharge assignments
  for (const section of existing.sections) {
    await prisma.siteInchargeAssignment.deleteMany({
      where: { sectionId: section.id },
    });
    await prisma.projectManagerAssignment.deleteMany({
      where: { sectionId: section.id },
    });
    await prisma.constructionManagerAssignment.deleteMany({
      where: { sectionId: section.id },
    });
    await prisma.accountantAssignment.deleteMany({
      where: { sectionId: section.id },
    });
    // For all stores in this section, delete their store incharge assignments
    const stores = await prisma.store.findMany({
      where: { sectionId: section.id },
    });
    for (const store of stores) {
      await prisma.storeInchargeAssignment.deleteMany({
        where: { storeId: store.id },
      });
    }
  }

  await prisma.project.update({
    where: { id },
    data: {
      isDeleted: true,
      isActive: false,
      updatedBy: userId,
      updatedAt: new Date(),
    },
  });

  res.json({
    message: "Project deleted successfully",
  });
  await sendNotificationToUserSafe({
    userId,
    title: "Project Deleted",
    body: `Project ${existing.name} was deleted successfully.`,
  });
});

const activateProject = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Project not found", 404));
  }

  const updatedProject = await prisma.project.update({
    where: { id },
    data: {
      isActive: true,
      updatedBy: userId,
      updatedAt: new Date(),
    },
    include: {
      sections: {
        where: { isDeleted: false },
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
        },
      },
    },
  });

  res.json({
    message: "Project activated successfully",
    project: updatedProject,
  });
  await sendNotificationToUserSafe({
    userId,
    title: "Project Activated",
    body: `Project ${updatedProject.name} was activated successfully.`,
  });
});

const deactivateProject = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Project not found", 404));
  }

  const updatedProject = await prisma.project.update({
    where: { id },
    data: {
      isActive: false,
      updatedBy: userId,
      updatedAt: new Date(),
    },
    include: {
      sections: {
        where: { isDeleted: false },
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
        },
      },
    },
  });

  res.json({
    message: "Project deactivated successfully",
    project: updatedProject,
  });
  await sendNotificationToUserSafe({
    userId,
    title: "Project Deactivated",
    body: `Project ${updatedProject.name} was deactivated successfully.`,
  });
});

export {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,
  activateProject,
  deactivateProject,
};
