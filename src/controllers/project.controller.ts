import { PrismaClient } from "@prisma/client";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/appError";
import { generateProjectCode } from "../utils/generateCode";
import { buildQueryOptions, extractQueryParams, buildPaginationMeta } from "../utils/buildQueryOptions";

const prisma = new PrismaClient();

const createProject = catchAsync(async (req, res, next) => {
  const {
    name,
    description,
    startDate,
    endDate,
  } = req.body;
  const userId = req.user.id;

  if (!name) {
    return next(new AppError("Name is required", 400));
  }

  // Generate automatic project code
  const code = await generateProjectCode();

  const project = await prisma.project.create({
    data: {
      name,
      code,
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
        }
      }
    }
  });

  res.status(201).json({
    message: "Project created successfully",
    project,
  });
});

const getProjects = catchAsync(async (req, res) => {
  const user = req.user;

  // Extract query parameters
  const filterOptions = extractQueryParams(req);
  
  // Define searchable fields for projects
  const searchableFields = ['name', 'code', 'description'];
  
  // Build default filters
  let defaultFilters: any = { isDeleted: false };

  // Role-based filtering for projects
  let assignedSectionIds: string[] = [];
  if (user.role === 'ADMIN') {
    // No filter, see all
  } else if (user.role === 'SITE_INCHARGE') {
    const assignments = await prisma.siteInchargeAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { projectId: true, sectionId: true }
    });
    const projectIds = assignments.map(a => a.projectId);
    assignedSectionIds = assignments.map(a => a.sectionId);
    defaultFilters.id = { in: projectIds };
  } else if (user.role === 'PROJECT_MANAGER') {
    const assignments = await prisma.projectManagerAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { projectId: true, sectionId: true }
    });
    const projectIds = assignments.map(a => a.projectId);
    assignedSectionIds = assignments.map(a => a.sectionId);
    defaultFilters.id = { in: projectIds };
  } else if (user.role === 'CONSTRUCTION_MANAGER') {
    const assignments = await prisma.constructionManagerAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { section: { select: { projectId: true, id: true } } }
    });
    const projectIds = assignments.map(a => a.section.projectId);
    assignedSectionIds = assignments.map(a => a.section.id);
    defaultFilters.id = { in: projectIds };
  } else if (user.role === 'STORE_INCHARGE') {
    const assignments = await prisma.storeInchargeAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { store: { select: { section: { select: { projectId: true, id: true } } } } }
    });
    const projectIds = assignments.map(a => a.store.section.projectId);
    assignedSectionIds = assignments.map(a => a.store.section.id);
    defaultFilters.id = { in: projectIds };
  } else if (user.role === 'ACCOUNTANT') {
    const assignments = await prisma.accountantAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { projectId: true, sectionId: true }
    });
    const projectIds = assignments.map(a => a.projectId);
    assignedSectionIds = assignments.map(a => a.sectionId);
    defaultFilters.id = { in: projectIds };
  }

  // Build query options
  const queryOptions = buildQueryOptions(filterOptions, defaultFilters, searchableFields);

  // Get total count for pagination
  const total = await prisma.project.count({
    where: queryOptions.where
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
        }
      },
      
      _count: {
        select: {
          sections: true,
        }
      }
    }
  });

  // Filter sections per project based on role/assignments
  const filteredProjects = projects.map(project => {
    let filteredSections = project.sections;
    if (user.role !== 'ADMIN' && Array.isArray(filteredSections)) {
      // Only keep sections with required properties
      filteredSections = filteredSections
        .filter(section =>
          section && typeof section === 'object' &&
          'id' in section && 'name' in section && 'code' in section
        )
        .filter(section => assignedSectionIds.includes((section as any).id));
    }
    return {
      ...project,
      sections: filteredSections
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
    ...paginationMeta
  });
});

const getProjectById = catchAsync(async (req, res, next) => {
  const { id } = req.params;

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
                }
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
                    }
                  }
                }
              }
            }
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
                }
              }
            }
          }
        }
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
            }
          },
          section: {
            select: {
              id: true,
              name: true,
              code: true,
            }
          }
        }
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
            }
          },
          section: {
            select: {
              id: true,
              name: true,
              code: true,
            }
          }
        }
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
            }
          },
          section: {
            select: {
              id: true,
              name: true,
              code: true,
            }
          }
        }
      }
    }
  });

  if (!project) {
    return next(new AppError("Project not found", 404));
  }

  // Create a single list of all associated members with their roles
  const allMembers = new Map();

  // Add site incharges
  project.siteInchargeAssignments.forEach(assignment => {
    const userId = assignment.user.id;
    if (!allMembers.has(userId)) {
      allMembers.set(userId, {
        id: assignment.user.id,
        name: assignment.user.name,
        email: assignment.user.email,
        role: assignment.user.role,
        assignments: []
      });
    }
    allMembers.get(userId).assignments.push({
      type: 'Site Incharge',
      section: assignment.section
    });
  });

  // Add project managers
  project.projectManagerAssignments.forEach(assignment => {
    const userId = assignment.user.id;
    if (!allMembers.has(userId)) {
      allMembers.set(userId, {
        id: assignment.user.id,
        name: assignment.user.name,
        email: assignment.user.email,
        role: assignment.user.role,
        assignments: []
      });
    }
    allMembers.get(userId).assignments.push({
      type: 'Project Manager',
      section: assignment.section
    });
  });

  // Add accountants
  project.accountantAssignments.forEach(assignment => {
    const userId = assignment.user.id;
    if (!allMembers.has(userId)) {
      allMembers.set(userId, {
        id: assignment.user.id,
        name: assignment.user.name,
        email: assignment.user.email,
        role: assignment.user.role,
        assignments: []
      });
    }
    allMembers.get(userId).assignments.push({
      type: 'Accountant',
      section: assignment.section
    });
  });

  // Add construction managers from sections
  project.sections.forEach(section => {
    section.constructionManagerAssignments.forEach(assignment => {
      const userId = assignment.user.id;
      if (!allMembers.has(userId)) {
        allMembers.set(userId, {
          id: assignment.user.id,
          name: assignment.user.name,
          email: assignment.user.email,
          role: assignment.user.role,
          assignments: []
        });
      }
      allMembers.get(userId).assignments.push({
        type: 'Construction Manager',
        section: {
          id: section.id,
          name: section.name,
          code: section.code
        }
      });
    });
  });

  // Add store incharges from all stores in sections
  project.sections.forEach(section => {
    section.stores.forEach(store => {
      store.storeInchargeAssignments.forEach(assignment => {
        const userId = assignment.user.id;
        if (!allMembers.has(userId)) {
          allMembers.set(userId, {
            id: assignment.user.id,
            name: assignment.user.name,
            email: assignment.user.email,
            role: assignment.user.role,
            assignments: []
          });
        }
        allMembers.get(userId).assignments.push({
          type: `Store Incharge (${store.type})`,
          section: {
            id: section.id,
            name: section.name,
            code: section.code
          },
          store: {
            id: store.id,
            name: store.name,
            type: store.type
          }
        });
      });
    });
  });

  // Convert map to array
  const associatedMembers = Array.from(allMembers.values());

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
    sections: project.sections,
    assignedSiteIncharges: project.siteInchargeAssignments,
    assignedAccountants: project.accountantAssignments,
    associatedMembers: associatedMembers
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
  delete updates.code; // Prevent manual code updates

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Project not found", 404));
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
        }
      }
    }
  });

  res.json({
    message: "Project updated successfully",
    project: updatedProject,
  });
});

const deleteProject = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Project not found", 404));
  }

  await prisma.project.update({
    where: { id },
    data: {
      isDeleted: true,
      isActive: false,
      updatedBy: userId,
      updatedAt: new Date(),
    }
  });

  res.json({
    message: "Project deleted successfully",
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
        }
      }
    }
  });

  res.json({
    message: "Project activated successfully",
    project: updatedProject,
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
        }
      }
    }
  });

  res.json({
    message: "Project deactivated successfully",
    project: updatedProject,
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