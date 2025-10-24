import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import express from "express";
import path from "path";
import fs from "fs";
import csv from "csv-parser";
import { Readable } from "stream";
import { storage } from "./storage";
import { authenticateToken, requireRole, generateToken, type AuthenticatedRequest } from "./middleware/auth";
import { db } from "./db";
import { users, patients, treatments, budgetItems, treatmentMovements, clinics } from "@shared/schema";
import { eq, and, or, isNotNull, sql } from "drizzle-orm";
import { upload, uploadCSV } from "./middleware/upload";
import { sendEmail, generatePasswordResetEmail } from "./email";
import { ObjectStorageService } from "./objectStorage";
import {
  insertUserSchema,
  insertPatientSchema,
  insertAppointmentSchema,
  insertMedicalRecordSchema,
  insertAnamnesisQuestionSchema,
  insertAnamnesisResponseSchema,
  insertBudgetSchema,
  insertTreatmentSchema,
  insertBudgetItemSchema,
  insertBudgetSummarySchema,
  insertTreatmentMovementSchema,
  insertClinicSchema,
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve uploaded files
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user || !user.isActive) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = generateToken(user.id);

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          clinicId: user.clinicId,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Password reset request route
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await storage.getUserByEmail(email);

      // For security, always return success even if user doesn't exist
      console.log(`Password reset requested for: ${email}${user ? ' (user found)' : ' (user not found)'}`);

      if (user) {
        // Generate secure reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

        // Save token to database
        await storage.createPasswordResetToken({
          userId: user.id,
          token: resetToken,
          expiresAt,
          isUsed: false
        });

        // Send email with reset link
        try {
          const protocol = req.secure ? 'https' : 'http';
          const baseUrl = `${protocol}://${req.get('host') || 'localhost:5000'}`;
          const emailData = generatePasswordResetEmail(user.email, resetToken, baseUrl);

          const emailSent = await sendEmail(emailData);

          if (emailSent) {
            console.log(`Password reset email sent successfully to ${email}`);
          } else {
            console.error(`Failed to send password reset email to ${email}`);
          }
        } catch (emailError) {
          console.error(`Email sending error:`, emailError);
          // Continue - don't fail the request if email fails
        }
      }

      res.json({ 
        message: "If the email is registered, you will receive password reset instructions." 
      });
    } catch (error) {
      console.error("Password reset error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Validate reset token route
  app.post("/api/auth/validate-reset-token", async (req, res) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ message: "Token is required" });
      }

      const resetToken = await storage.getPasswordResetToken(token);

      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }

      res.json({ message: "Token is valid" });
    } catch (error) {
      console.error("Token validation error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Confirm password reset route
  app.post("/api/auth/confirm-reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      // Validate password strength
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }

      const resetToken = await storage.getPasswordResetToken(token);

      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }

      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update user password
      const updatedUser = await storage.updateUserPassword(resetToken.userId, hashedPassword);

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Mark token as used
      await storage.markTokenAsUsed(token);

      // Clean up expired tokens
      await storage.deleteExpiredTokens();

      res.json({ message: "Password reset successfully" });
    } catch (error) {
      console.error("Password reset confirmation error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/register-clinic", async (req, res) => {
    try {
      const { clinicName, clinicEmail, adminName, adminEmail, password } = req.body;

      if (!clinicName || !clinicEmail || !adminName || !adminEmail || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }

      // Check if clinic email already exists
      const existingUser = await storage.getUserByEmail(adminEmail);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Create clinic
      const clinic = await storage.createClinic({
        name: clinicName,
        email: clinicEmail,
      });

      // Create admin user
      const hashedPassword = await bcrypt.hash(password, 10);
      const admin = await storage.createUser({
        username: adminEmail,
        email: adminEmail,
        password: hashedPassword,
        fullName: adminName,
        role: "admin",
        clinicId: clinic.id,
        isActive: true,
      });

      // Create default anamnesis questions
      const defaultQuestions = [
        "Você tem alguma alergia medicamentosa?",
        "Possui alguma doença cardíaca?",
        "Tem diabetes?",
        "Está tomando algum medicamento atualmente?",
        "Já teve alguma reação adversa durante tratamento odontológico?",
      ];

      for (const question of defaultQuestions) {
        await storage.createAnamnesisQuestion({
          question,
          type: "text",
          isRequired: false,
          clinicId: clinic.id,
        });
      }

      const token = generateToken(admin.id);

      res.status(201).json({
        token,
        user: {
          id: admin.id,
          email: admin.email,
          fullName: admin.fullName,
          role: admin.role,
          clinicId: admin.clinicId,
        },
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Dashboard routes
  app.get("/api/dashboard/stats", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const stats = await storage.getDashboardStats(req.user!.clinicId);
      res.json(stats);
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/dashboard/today-appointments", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const today = new Date();
      const appointments = await storage.getAppointmentsByDate(req.user!.clinicId, today);
      res.json(appointments);
    } catch (error) {
      console.error("Today appointments error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/dashboard/birthday-patients", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 5; // Define um padrão de 5 itens por página

      // A lógica de data foi removida. A função 'storage' agora cuida de tudo,
      // incluindo a paginação que o frontend espera.
      const paginatedResult = await storage.getBirthdayPatients(req.user!.clinicId, { page, pageSize });
      res.json(paginatedResult);

    } catch (error) {
      console.error("Birthday patients error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // User routes
  app.get("/api/users", authenticateToken, requireRole(["admin"]), async (req: AuthenticatedRequest, res) => {
    try {
      const users = await storage.getUsersByClinic(req.user!.clinicId);
      const sanitizedUsers = users.map(({ password, ...user }) => user);
      res.json(sanitizedUsers);
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/users", authenticateToken, requireRole(["admin"]), async (req: AuthenticatedRequest, res) => {
    try {
      const userData = insertUserSchema.parse({
        ...req.body,
        clinicId: req.user!.clinicId,
      });

      // Check if email already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword,
      });

      const { password, ...sanitizedUser } = user;
      res.status(201).json(sanitizedUser);
    } catch (error: any) {
      console.error("Create user error:", error);

      // Handle specific database errors
      if (error.code === '23505') {
        if (error.constraint?.includes('username')) {
          return res.status(400).json({ message: "Este nome de usuário já está em uso. Escolha outro." });
        }
        if (error.constraint?.includes('email')) {
          return res.status(400).json({ message: "Este email já está cadastrado. Use outro email." });
        }
        return res.status(400).json({ message: "Dados duplicados. Verifique as informações preenchidas." });
      }

      // Handle Zod validation errors
      if (error.name === 'ZodError') {
        const fieldErrors = error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
        return res.status(400).json({ message: `Dados inválidos: ${fieldErrors}` });
      }

      res.status(500).json({ message: "Erro interno do servidor. Tente novamente." });
    }
  });

  app.put("/api/users/:id", authenticateToken, requireRole(["admin"]), async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      // Log dos dados recebidos para depuração
      console.log("PUT /api/users/:id - Request body:", req.body);

      const parsedData = insertUserSchema.partial().parse(req.body);

      // Cria uma cópia mutável para permitir modificações
      const updateData = { ...parsedData };

      // Só atualiza a senha se uma nova senha for fornecida (não vazia, null ou undefined)
      if (updateData.password && updateData.password.trim() !== '') {
        updateData.password = await bcrypt.hash(updateData.password, 10);
      } else {
        // Remove o campo password do updateData para não atualizar
        delete updateData.password;
      }

      const updatedUser = await storage.updateUser(id, updateData);

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password, ...sanitizedUser } = updatedUser;
      res.json(sanitizedUser);
    } catch (error: any) {
      console.error("Update user error:", error);

      // Tratamento de erro de violação de constraint (duplicação)
      if (error.code === '23505') {
        if (error.constraint?.includes('username')) {
          return res.status(400).json({ message: "Este nome de usuário já está em uso. Escolha outro." });
        }
        if (error.constraint?.includes('email')) {
          return res.status(400).json({ message: "Este email já está cadastrado. Use outro email." });
        }
        return res.status(400).json({ message: "Dados duplicados. Verifique as informações preenchidas." });
      }

      // Tratamento de erro de validação Zod
      if (error.name === 'ZodError') {
        const fieldErrors = error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
        return res.status(400).json({ message: `Dados inválidos: ${fieldErrors}` });
      }

      // Erro genérico do servidor com mensagem de depuração
      res.status(500).json({ message: `Erro interno do servidor: ${error.message}` });
    }
  });

  // Clinic routes
  app.get("/api/clinic", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const clinic = await storage.getClinicById(req.user!.clinicId);
      if (!clinic) {
        return res.status(404).json({ message: "Clinic not found" });
      }
      res.json(clinic);
    } catch (error) {
      console.error("Get clinic error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/clinic", authenticateToken, requireRole(["admin"]), async (req: AuthenticatedRequest, res) => {
    try {
      const clinicData = insertClinicSchema.parse(req.body);
      const updatedClinic = await storage.updateClinic(req.user!.clinicId, clinicData);
      res.json(updatedClinic);
    } catch (error: any) {
      console.error("Update clinic error:", error);

      // Handle specific database errors
      if (error.code === '23505') {
        if (error.constraint?.includes('email')) {
          return res.status(400).json({ message: "Este email já está em uso por outra clínica." });
        }
        return res.status(400).json({ message: "Dados duplicados. Verifique as informações preenchidas." });
      }

      // Handle Zod validation errors
      if (error.name === 'ZodError') {
        const fieldErrors = error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
        return res.status(400).json({ message: `Dados inválidos: ${fieldErrors}` });
      }

      res.status(500).json({ message: "Erro interno do servidor. Tente novamente." });
    }
  });

  app.post("/api/clinic/upload-logo", authenticateToken, requireRole(["admin"]), upload.single('logo'), async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          message: "Nenhum arquivo foi enviado"
        });
      }

      const logoUrl = `/uploads/${req.file.filename}`;

      // Update clinic with new logo URL
      const updatedClinic = await storage.updateClinic(req.user!.clinicId, { logoUrl });

      res.json({ logoUrl, clinic: updatedClinic });
    } catch (error: any) {
      console.error("Upload logo error:", error);
      res.status(500).json({ 
        message: "Erro ao fazer upload do logo",
        error: error.message
      });
    }
  });

  // Upload patient photo
  app.post("/api/patients/:id/photo", authenticateToken, requireRole(["admin", "secretary"]), upload.single('photo'), async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          message: "Nenhum arquivo foi enviado"
        });
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB in bytes
      if (req.file.size > maxSize) {
        return res.status(400).json({ 
          message: "O arquivo é muito grande. Tamanho máximo: 5MB"
        });
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ 
          message: "Tipo de arquivo inválido. Use: JPG, PNG ou WEBP"
        });
      }

      let photoUrl: string;
      const isProduction = process.env.NODE_ENV === 'production';

      if (isProduction) {
        try {
          const objectStorageService = new ObjectStorageService();
          photoUrl = await objectStorageService.uploadFile(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype
          );

          if (req.file.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
        } catch (storageError: any) {
          console.error("Object storage error (falling back to local):", storageError);
          photoUrl = `/uploads/${req.file.filename}`;
        }
      } else {
        photoUrl = `/uploads/${req.file.filename}`;
      }

      const patient = await storage.getPatientById(req.params.id, req.user!.clinicId);
      if (!patient) {
        return res.status(404).json({ message: "Paciente não encontrado" });
      }

      if (patient.photoUrl) {
        if (isProduction && patient.photoUrl.startsWith('http')) {
          try {
            const objectStorageService = new ObjectStorageService();
            await objectStorageService.deleteFile(patient.photoUrl);
          } catch (deleteError) {
            console.error("Error deleting old photo from object storage:", deleteError);
          }
        } else if (!isProduction && patient.photoUrl.startsWith('/uploads/')) {
          try {
            const oldFilePath = path.join(process.cwd(), patient.photoUrl);
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
            }
          } catch (deleteError) {
            console.error("Error deleting old photo from filesystem:", deleteError);
          }
        }
      }

      const updatedPatient = await storage.updatePatient(req.params.id, { photoUrl }, req.user!.clinicId);

      if (!updatedPatient) {
        return res.status(404).json({ message: "Paciente não encontrado" });
      }

      res.json({ photoUrl, patient: updatedPatient });
    } catch (error: any) {
      console.error("Upload patient photo error:", error);
      res.status(500).json({ 
        message: "Erro ao fazer upload da foto",
        error: error.message
      });
    }
  });

  // Public route to get clinic branding for login page
  app.get("/api/clinic/branding/:email", async (req, res) => {
    try {
      const { email } = req.params;

      // Find clinic by email to get branding info
      const [clinic] = await db.select({ 
        name: clinics.name, 
        logoUrl: clinics.logoUrl 
      }).from(clinics).where(eq(clinics.email, email)).limit(1);

      if (clinic) {
        res.json({ 
          clinicName: clinic.name,
          logoUrl: clinic.logoUrl 
        });
      } else {
        // Return default branding if no clinic found
        res.json({ 
          clinicName: "DentiCare",
          logoUrl: null 
        });
      }
    } catch (error) {
      console.error("Get clinic branding error:", error);
      // Return default branding on error
      res.json({ 
        clinicName: "DentiCare",
        logoUrl: null 
      });
    }
  });

  // Patient routes
  app.get("/api/patients", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 50;
      const search = (req.query.search as string)?.trim() || '';

      // Validate and sanitize pagination parameters
      const validPage = Math.max(1, page);
      const validPageSize = Math.min(Math.max(1, pageSize), 100); // Max 100 per page
      const offset = (validPage - 1) * validPageSize;

      // Build where conditions
      const whereConditions = search
        ? and(
            eq(patients.clinicId, req.user!.clinicId),
            or(
              sql`LOWER(${patients.fullName}) LIKE LOWER(${'%' + search + '%'})`,
              sql`${patients.cpf} LIKE ${search + '%'}`,
              sql`${patients.phone} LIKE ${'%' + search + '%'}`
            )
          )
        : eq(patients.clinicId, req.user!.clinicId);

      // Get total count for pagination
      const [{ count: totalCount }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(patients)
        .where(whereConditions);

      const totalPages = Math.ceil(totalCount / validPageSize);

      // Get paginated results
      const patientsData = await db
        .select()
        .from(patients)
        .where(whereConditions)
        .orderBy(patients.fullName)
        .limit(validPageSize)
        .offset(offset);

      res.json({
        data: patientsData,
        pagination: {
          page: validPage,
          pageSize: validPageSize,
          totalCount,
          totalPages
        }
      });
    } catch (error) {
      console.error("Get patients error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/patients", authenticateToken, requireRole(["admin", "secretary"]), async (req: AuthenticatedRequest, res) => {
    try {
      let requestData = { ...req.body, clinicId: req.user!.clinicId };

      // Clean up empty fields - convert empty strings to null
      const nullableFields = ['birthDate', 'lastVisitDate', 'lastContactDate', 'responsibleDentistId', 'cpf', 'email', 'birthCity', 'maritalStatus', 'cep', 'address', 'number', 'complement', 'neighborhood', 'city', 'state', 'responsibleName', 'responsibleCpf', 'howDidYouKnowUs', 'howDidYouKnowUsOther'];
      nullableFields.forEach(field => {
        if (requestData[field] === "" || requestData[field] === undefined) {
          requestData[field] = null;
        }
      });

      const patientData = insertPatientSchema.parse(requestData);
      const patient = await storage.createPatient(patientData);
      res.status(201).json(patient);
    } catch (error: any) {
      console.error("Create patient error:", error);

      // Handle specific database errors
      if (error.code === '23503') {
        if (error.constraint?.includes('responsible_dentist_id')) {
          return res.status(400).json({ message: "Dentista responsável inválido. Selecione um dentista válido." });
        }
        return res.status(400).json({ message: "Referência inválida. Verifique os dados preenchidos." });
      }

      if (error.code === '23505') {
        if (error.constraint?.includes('cpf')) {
          return res.status(400).json({ message: "Este CPF já está cadastrado no sistema." });
        }
        if (error.constraint?.includes('email')) {
          return res.status(400).json({ message: "Este email já está cadastrado no sistema." });
        }
        return res.status(400).json({ message: "Dados duplicados. Verifique as informações preenchidas." });
      }

      if (error.code === '22007') {
        return res.status(400).json({ message: "Data inválida. Verifique o formato das datas preenchidas." });
      }

      // Handle Zod validation errors
      if (error.name === 'ZodError') {
        const fieldErrors = error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
        return res.status(400).json({ message: `Dados inválidos: ${fieldErrors}` });
      }

      res.status(500).json({ message: "Erro interno do servidor. Tente novamente." });
    }
  });

  app.get("/api/patients/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const patient = await storage.getPatientById(req.params.id, req.user!.clinicId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }
      res.json(patient);
    } catch (error) {
      console.error("Get patient error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/patients/by-external-id/:externalId", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      // Remove zeros à esquerda do external_id (ex: "0000007683" -> "7683")
      const cleanedExternalId = String(parseInt(req.params.externalId, 10));
      
      const patient = await storage.getPatientByExternalId(cleanedExternalId, req.user!.clinicId);
      if (!patient) {
        return res.status(404).json({ message: "Paciente não encontrado" });
      }
      res.json(patient);
    } catch (error) {
      console.error("Get patient by external ID error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/patients/:id", authenticateToken, requireRole(["admin", "secretary"]), async (req: AuthenticatedRequest, res) => {
    try {
      let updateData = insertPatientSchema.partial().parse(req.body);

      // Clean up empty fields - convert empty strings to null
      const nullableFields = ['birthDate', 'lastVisitDate', 'lastContactDate', 'responsibleDentistId', 'cpf', 'email', 'birthCity', 'maritalStatus', 'cep', 'address', 'number', 'complement', 'neighborhood', 'city', 'state', 'responsibleName', 'responsibleCpf', 'howDidYouKnowUs', 'howDidYouKnowUsOther'] as const;
      nullableFields.forEach(field => {
        if ((updateData as any)[field] === "" || (updateData as any)[field] === undefined) {
          (updateData as any)[field] = null;
        }
      });

      if (updateData.photoUrl === null) {
        const currentPatient = await storage.getPatientById(req.params.id, req.user!.clinicId);
        if (currentPatient?.photoUrl) {
          const isProduction = process.env.NODE_ENV === 'production';
          if (isProduction && currentPatient.photoUrl.startsWith('http')) {
            try {
              const objectStorageService = new ObjectStorageService();
              await objectStorageService.deleteFile(currentPatient.photoUrl);
            } catch (deleteError) {
              console.error("Error deleting photo from object storage:", deleteError);
            }
          } else if (!isProduction && currentPatient.photoUrl.startsWith('/uploads/')) {
            try {
              const filePath = path.join(process.cwd(), currentPatient.photoUrl);
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            } catch (deleteError) {
              console.error("Error deleting photo from filesystem:", deleteError);
            }
          }
        }
      }

      const patient = await storage.updatePatient(req.params.id, updateData, req.user!.clinicId);

      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      res.json(patient);
    } catch (error: any) {
      console.error("Update patient error:", error);

      // Handle specific database errors
      if (error.code === '23503') {
        if (error.constraint?.includes('responsible_dentist_id')) {
          return res.status(400).json({ message: "Dentista responsável inválido. Selecione um dentista válido." });
        }
        return res.status(400).json({ message: "Referência inválida. Verifique os dados preenchidos." });
      }

      if (error.code === '23505') {
        if (error.constraint?.includes('cpf')) {
          return res.status(400).json({ message: "Este CPF já está cadastrado no sistema." });
        }
        if (error.constraint?.includes('email')) {
          return res.status(400).json({ message: "Este email já está cadastrado no sistema." });
        }
        return res.status(400).json({ message: "Dados duplicados. Verifique as informações preenchidas." });
      }

      if (error.code === '22007') {
        return res.status(400).json({ message: "Data inválida. Verifique o formato das datas preenchidas." });
      }

      // Handle Zod validation errors
      if (error.name === 'ZodError') {
        const fieldErrors = error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
        return res.status(400).json({ message: `Dados inválidos: ${fieldErrors}` });
      }

      res.status(500).json({ message: "Erro interno do servidor. Tente novamente." });
    }
  });

  app.delete("/api/patients/:id", authenticateToken, requireRole(["admin", "secretary"]), async (req: AuthenticatedRequest, res) => {
    try {
      const deleted = await storage.deletePatient(req.params.id, req.user!.clinicId);
      if (!deleted) {
        return res.status(404).json({ message: "Patient not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Delete patient error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Appointment routes
  app.get("/api/appointments", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const appointments = await storage.getAppointmentsByClinic(req.user!.clinicId);
      res.json(appointments);
    } catch (error) {
      console.error("Get appointments error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/appointments", authenticateToken, requireRole(["admin", "secretary"]), async (req: AuthenticatedRequest, res) => {
    try {
      let requestData = { ...req.body, clinicId: req.user!.clinicId };

      // NO TIMEZONE CONVERSION - Save exactly what was received
      if (requestData.scheduledDate) {
        requestData.scheduledDate = new Date(requestData.scheduledDate);
      }

      // Validate duration: minimum 5 minutes, maximum until midnight
      if (requestData.duration) {
        if (requestData.duration < 5) {
          return res.status(400).json({ message: "A duração mínima do agendamento é de 5 minutos." });
        }

        if (requestData.scheduledDate) {
          const scheduledDateTime = new Date(requestData.scheduledDate);
          const nextDayStart = new Date(scheduledDateTime);
          nextDayStart.setHours(24, 0, 0, 0); // Start of next day (midnight)

          const diffMs = nextDayStart.getTime() - scheduledDateTime.getTime();
          const maxMinutes = Math.ceil(diffMs / (1000 * 60));

          if (requestData.duration > maxMinutes) {
            return res.status(400).json({ message: "A duração do agendamento não pode ultrapassar a meia-noite." });
          }
        }
      }

      const appointmentData = insertAppointmentSchema.parse(requestData);
      const appointment = await storage.createAppointment(appointmentData);
      res.status(201).json(appointment);
    } catch (error: any) {
      console.error("Create appointment error:", error);

      // Handle specific database errors
      if (error.code === '23503') {
        if (error.constraint?.includes('patient_id')) {
          return res.status(400).json({ message: "Paciente inválido. Selecione um paciente válido." });
        }
        if (error.constraint?.includes('dentist_id')) {
          return res.status(400).json({ message: "Dentista inválido. Selecione um dentista válido." });
        }
        return res.status(400).json({ message: "Referência inválida. Verifique os dados preenchidos." });
      }

      if (error.code === '22007') {
        return res.status(400).json({ message: "Data/hora inválida. Verifique o horário do agendamento." });
      }

      // Handle Zod validation errors
      if (error.name === 'ZodError') {
        const fieldErrors = error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
        return res.status(400).json({ message: `Dados inválidos: ${fieldErrors}` });
      }

      res.status(500).json({ message: "Erro interno do servidor. Tente novamente." });
    }
  });

  app.put("/api/appointments/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      let updateData = { ...req.body };

      // NO TIMEZONE CONVERSION - Save exactly what was received
      if (updateData.scheduledDate) {
        updateData.scheduledDate = new Date(updateData.scheduledDate);
      }

      // Validate duration: minimum 5 minutes, maximum until midnight
      if (updateData.duration !== undefined) {
        if (updateData.duration < 5) {
          return res.status(400).json({ message: "A duração mínima do agendamento é de 5 minutos." });
        }

        const scheduledDate = updateData.scheduledDate || (await storage.getAppointmentById(req.params.id, req.user!.clinicId))?.scheduledDate;
        if (scheduledDate) {
          const scheduledDateTime = new Date(scheduledDate);
          const nextDayStart = new Date(scheduledDateTime);
          nextDayStart.setHours(24, 0, 0, 0); // Start of next day (midnight)

          const diffMs = nextDayStart.getTime() - scheduledDateTime.getTime();
          const maxMinutes = Math.ceil(diffMs / (1000 * 60));

          if (updateData.duration > maxMinutes) {
            return res.status(400).json({ message: "A duração do agendamento não pode ultrapassar a meia-noite." });
          }
        }
      }

      const parsedData = insertAppointmentSchema.partial().parse(updateData);
      const appointment = await storage.updateAppointment(req.params.id, parsedData, req.user!.clinicId);

      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      res.json(appointment);
    } catch (error: any) {
      console.error("Update appointment error:", error);

      // Handle specific database errors
      if (error.code === '23503') {
        if (error.constraint?.includes('patient_id')) {
          return res.status(400).json({ message: "Paciente inválido. Selecione um paciente válido." });
        }
        if (error.constraint?.includes('dentist_id')) {
          return res.status(400).json({ message: "Dentista inválido. Selecione um dentista válido." });
        }
        return res.status(400).json({ message: "Referência inválida. Verifique os dados preenchidos." });
      }

      if (error.code === '22007') {
        return res.status(400).json({ message: "Data/hora inválida. Verifique o horário do agendamento." });
      }

      // Handle Zod validation errors
      if (error.name === 'ZodError') {
        const fieldErrors = error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
        return res.status(400).json({ message: `Dados inválidos: ${fieldErrors}` });
      }

      res.status(500).json({ message: "Erro interno do servidor. Tente novamente." });
    }
  });

  app.delete("/api/appointments/:id", authenticateToken, requireRole(["admin", "secretary"]), async (req: AuthenticatedRequest, res) => {
    try {
      const deleted = await storage.deleteAppointment(req.params.id, req.user!.clinicId);
      if (!deleted) {
        return res.status(404).json({ message: "Agendamento não encontrado" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Delete appointment error:", error);
      res.status(500).json({ message: "Erro ao excluir agendamento. Por favor, tente novamente." });
    }
  });

  // Medical record routes
  app.get("/api/medical-records/patient/:patientId", authenticateToken, requireRole(["admin", "dentist"]), async (req: AuthenticatedRequest, res) => {
    try {
      const records = await storage.getMedicalRecordsByPatient(req.params.patientId, req.user!.clinicId);
      res.json(records);
    } catch (error) {
      console.error("Get medical records error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/medical-records", authenticateToken, requireRole(["admin", "dentist"]), upload.array("images", 10), async (req: AuthenticatedRequest, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      const imagePaths = files ? files.map(file => `/uploads/${file.filename}`) : [];

      const recordData = insertMedicalRecordSchema.parse({
        ...req.body,
        clinicId: req.user!.clinicId,
        dentistId: req.user!.id,
        images: JSON.stringify(imagePaths),
      });

      const record = await storage.createMedicalRecord(recordData);
      res.status(201).json(record);
    } catch (error) {
      console.error("Create medical record error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Anamnesis routes
  app.get("/api/anamnesis/questions", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const questions = await storage.getAnamnesisQuestionsByClinic(req.user!.clinicId);
      res.json(questions);
    } catch (error) {
      console.error("Get anamnesis questions error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/anamnesis/questions", authenticateToken, requireRole(["admin"]), async (req: AuthenticatedRequest, res) => {
    try {
      const questionData = insertAnamnesisQuestionSchema.parse({
        ...req.body,
        clinicId: req.user!.clinicId,
      });

      const question = await storage.createAnamnesisQuestion(questionData);
      res.status(201).json(question);
    } catch (error) {
      console.error("Create anamnesis question error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/anamnesis/responses", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { responses } = req.body; // Array of { questionId, response, patientId, treatmentId }

      // First, delete existing responses for this treatment
      if (responses.length > 0) {
        const treatmentId = responses[0].treatmentId;
        await storage.deleteAnamnesisResponsesByTreatment(treatmentId);
      }

      const savedResponses = [];
      for (const responseData of responses) {
        if (responseData.response && responseData.response.trim()) { // Only save non-empty responses
          const response = await storage.createAnamnesisResponse(responseData);
          savedResponses.push(response);
        }
      }

      res.status(201).json(savedResponses);
    } catch (error) {
      console.error("Create anamnesis responses error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get anamnesis with responses for treatment
  app.get("/api/anamnesis/treatment/:treatmentId", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { treatmentId } = req.params;
      const anamnesis = await storage.getAnamnesisWithResponsesByTreatment(treatmentId, req.user!.clinicId);
      res.json(anamnesis);
    } catch (error) {
      console.error("Get anamnesis for treatment error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Budget routes
  app.get("/api/budgets", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const budgets = await storage.getBudgetsByClinic(req.user!.clinicId);
      res.json(budgets);
    } catch (error) {
      console.error("Get budgets error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/budgets", authenticateToken, requireRole(["admin", "dentist"]), async (req: AuthenticatedRequest, res) => {
    try {
      const budgetData = insertBudgetSchema.parse({
        ...req.body,
        clinicId: req.user!.clinicId,
        dentistId: req.user!.id,
      });

      const budget = await storage.createBudget(budgetData);
      res.status(201).json(budget);
    } catch (error) {
      console.error("Create budget error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/budgets/:id", authenticateToken, requireRole(["admin", "dentist"]), async (req: AuthenticatedRequest, res) => {
    try {
      const updateData = insertBudgetSchema.partial().parse(req.body);
      const budget = await storage.updateBudget(req.params.id, updateData, req.user!.clinicId);

      if (!budget) {
        return res.status(404).json({ message: "Budget not found" });
      }

      res.json(budget);
    } catch (error) {
      console.error("Update budget error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // WhatsApp simulation route
  app.post("/api/whatsapp/send", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { phone, message, type } = req.body;

      // Simulate WhatsApp message sending
      console.log(`📱 WhatsApp Message Sent (${type})`);
      console.log(`To: ${phone}`);
      console.log(`Message: ${message}`);
      console.log(`Clinic: ${req.user!.clinicId}`);
      console.log("---");

      res.json({ 
        success: true, 
        message: "WhatsApp message sent successfully (simulated)" 
      });
    } catch (error) {
      console.error("WhatsApp send error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Treatment routes
  app.post("/api/treatments", authenticateToken, async (req, res) => {
    try {
      const result = insertTreatmentSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid treatment data", errors: result.error.errors });
      }

      const authReq = req as AuthenticatedRequest;
      const treatmentData = {
        ...result.data,
        clinicId: authReq.user!.clinicId,
        dentistId: authReq.user!.id
      };

      const treatment = await storage.createTreatment(treatmentData);
      res.status(201).json(treatment);
    } catch (error) {
      console.error("Create treatment error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/treatments/patient/:patientId", authenticateToken, async (req, res) => {
    try {
      const { patientId } = req.params;
      const authReq = req as AuthenticatedRequest;

      const treatments = await storage.getTreatmentsByPatient(patientId, authReq.user!.clinicId);
      res.json(treatments);
    } catch (error) {
      console.error("Get treatments error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/treatments/:id", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const authReq = req as AuthenticatedRequest;

      const treatment = await storage.getTreatmentById(id, authReq.user!.clinicId);
      if (!treatment) {
        return res.status(404).json({ message: "Treatment not found" });
      }

      res.json(treatment);
    } catch (error) {
      console.error("Get treatment error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/treatments/:id", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const authReq = req as AuthenticatedRequest;

      const result = insertTreatmentSchema.partial().safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid treatment data", errors: result.error.errors });
      }

      const treatment = await storage.updateTreatment(id, result.data, authReq.user!.clinicId);
      if (!treatment) {
        return res.status(404).json({ message: "Treatment not found" });
      }

      res.json(treatment);
    } catch (error) {
      console.error("Update treatment error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/treatments/:id", authenticateToken, requireRole(['admin', 'dentist']), async (req, res) => {
    try {
      const { id } = req.params;
      const authReq = req as AuthenticatedRequest;

      const deleted = await storage.deleteTreatment(id, authReq.user!.clinicId);
      if (!deleted) {
        return res.status(404).json({ message: "Treatment not found" });
      }

      res.json({ message: "Treatment deleted successfully" });
    } catch (error) {
      console.error("Delete treatment error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Budget Items routes
  app.post("/api/budget-items", authenticateToken, async (req, res) => {
    try {
      const result = insertBudgetItemSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid budget item data", errors: result.error.errors });
      }

      const budgetItem = await storage.createBudgetItem(result.data);
      res.status(201).json(budgetItem);
    } catch (error) {
      console.error("Create budget item error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/budget-items/treatment/:treatmentId", authenticateToken, async (req, res) => {
    try {
      const { treatmentId } = req.params;

      const budgetItems = await storage.getBudgetItemsByTreatment(treatmentId);
      res.json(budgetItems);
    } catch (error) {
      console.error("Get budget items error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/budget-items/:id", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;

      const result = insertBudgetItemSchema.partial().safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid budget item data", errors: result.error.errors });
      }

      const budgetItem = await storage.updateBudgetItem(id, result.data);
      if (!budgetItem) {
        return res.status(404).json({ message: "Budget item not found" });
      }

      res.json(budgetItem);
    } catch (error) {
      console.error("Update budget item error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/budget-items/:id", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;

      const deleted = await storage.deleteBudgetItem(id);
      if (!deleted) {
        return res.status(404).json({ message: "Budget item not found" });
      }

      res.json({ message: "Budget item deleted successfully" });
    } catch (error) {
      console.error("Delete budget item error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Budget Summary routes
  app.post("/api/budget-summary", authenticateToken, async (req, res) => {
    try {
      const result = insertBudgetSummarySchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid budget summary data", errors: result.error.errors });
      }

      const budgetSummary = await storage.createOrUpdateBudgetSummary(result.data);
      res.json(budgetSummary);
    } catch (error) {
      console.error("Create/Update budget summary error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/budget-summary/treatment/:treatmentId", authenticateToken, async (req, res) => {
    try {
      const { treatmentId } = req.params;

      const budgetSummary = await storage.getBudgetSummaryByTreatment(treatmentId);
      res.json(budgetSummary);
    } catch (error) {
      console.error("Get budget summary error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Treatment Movements routes
  app.post("/api/treatment-movements", authenticateToken, upload.single('photo'), async (req, res) => {
    try {
      const movementData = { ...req.body };

      if (req.file) {
        movementData.fotoAtividade = `/uploads/${req.file.filename}`;
      }

      const result = insertTreatmentMovementSchema.safeParse(movementData);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid treatment movement data", errors: result.error.errors });
      }

      const movement = await storage.createTreatmentMovement(result.data);
      res.status(201).json(movement);
    } catch (error) {
      console.error("Create treatment movement error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/treatment-movements/treatment/:treatmentId", authenticateToken, async (req, res) => {
    try {
      const { treatmentId } = req.params;

      const movements = await storage.getTreatmentMovementsByTreatment(treatmentId);
      res.json(movements);
    } catch (error) {
      console.error("Get treatment movements error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/treatment-movements/:id", authenticateToken, upload.single('photo'), async (req, res) => {
    try {
      const { id } = req.params;
      const movementData = { ...req.body };

      if (req.file) {
        movementData.fotoAtividade = `/uploads/${req.file.filename}`;
      }

      const result = insertTreatmentMovementSchema.partial().safeParse(movementData);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid treatment movement data", errors: result.error.errors });
      }

      const movement = await storage.updateTreatmentMovement(id, result.data);
      if (!movement) {
        return res.status(404).json({ message: "Treatment movement not found" });
      }

      res.json(movement);
    } catch (error) {
      console.error("Update treatment movement error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/treatment-movements/:id", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;

      const deleted = await storage.deleteTreatmentMovement(id);
      if (!deleted) {
        return res.status(404).json({ message: "Treatment movement not found" });
      }

      res.json({ message: "Treatment movement deleted successfully" });
    } catch (error) {
      console.error("Delete treatment movement error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Anamnesis responses for treatments
  app.get("/api/anamnesis-responses/treatment/:treatmentId", authenticateToken, async (req, res) => {
    try {
      const { treatmentId } = req.params;

      const responses = await storage.getAnamnesisResponsesByTreatment(treatmentId);
      res.json(responses);
    } catch (error) {
      console.error("Get anamnesis responses error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/anamnesis-responses/treatment", authenticateToken, async (req, res) => {
    try {
      const result = insertAnamnesisResponseSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid anamnesis response data", errors: result.error.errors });
      }

      const response = await storage.createOrUpdateAnamnesisResponse(result.data);
      res.json(response);
    } catch (error) {
      console.error("Create/Update anamnesis response error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // CSV Import route
  app.post("/api/import-csv", authenticateToken, requireRole(["admin"]), uploadCSV.single('file'), async (req: AuthenticatedRequest, res) => {
    // Helper functions for CSV import
    function mapRole(role: string): string {
      const roleMap: { [key: string]: string } = {
        'dentista': 'dentist',
        'secretaria': 'secretary', 
        'admin': 'admin',
        'administrador': 'admin'
      };
      return roleMap[role?.toLowerCase()] || 'secretary';
    }

    function mapTreatmentStatus(status: string): string {
      const statusMap: { [key: string]: string } = {
        'em andamento': 'Em andamento',
        'concluído': 'Concluído',
        'concluido': 'Concluído',
        'cancelado': 'Cancelado'
      };
      return statusMap[status?.toLowerCase()] || 'Em andamento';
    }

    function mapGender(gender: string): string | null {
      if (!gender) return null;
      const genderMap: { [key: string]: string } = {
        'M': 'Masculino',
        'F': 'Feminino',
        'masculino': 'Masculino',
        'feminino': 'Feminino'
      };
      return genderMap[gender.toUpperCase()] || gender;
    }

    function mapMaritalStatus(status: string): string | null {
      if (!status) return null;
      const statusMap: { [key: string]: string } = {
        'SO': 'Solteiro',
        'CA': 'Casado',
        'DI': 'Divorciado',
        'VI': 'Viúvo',
        'solteiro': 'Solteiro',
        'casado': 'Casado',
        'divorciado': 'Divorciado',
        'viuvo': 'Viúvo',
        'viúvo': 'Viúvo'
      };
      return statusMap[status.toUpperCase()] || status;
    }

    function parseDate(dateStr: string): string {
      if (!dateStr || dateStr.trim() === '') return new Date().toISOString().split('T')[0];

      const cleaned = dateStr.trim();

      // Handle DD/MM/YYYY format with optional time component (09/05/1989 00:00:00)
      if (cleaned.includes('/')) {
        // Split by space first to separate date and time parts
        const dateTimeParts = cleaned.split(' ');
        const datePart = dateTimeParts[0];

        const parts = datePart.split('/');
        if (parts.length === 3) {
          const [day, month, year] = parts;
          const fullYear = year.length === 2 ? `20${year}` : year;

          // Validate the parsed components
          const dayNum = parseInt(day, 10);
          const monthNum = parseInt(month, 10);
          const yearNum = parseInt(fullYear, 10);

          if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900) {
            return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
        }
      }

      // Handle DD-MM-YYYY format
      if (cleaned.includes('-') && cleaned.length >= 8) {
        const parts = cleaned.split('-');
        if (parts.length === 3 && parts[0].length <= 2) {
          const [day, month, year] = parts;
          const fullYear = year.length === 2 ? `20${year}` : year;

          // Validate the parsed components
          const dayNum = parseInt(day, 10);
          const monthNum = parseInt(month, 10);
          const yearNum = parseInt(fullYear, 10);

          if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900) {
            return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
        }
      }

      // If all parsing fails, return today's date as fallback
      console.warn(`Unable to parse date: "${dateStr}", using today's date as fallback`);
      return new Date().toISOString().split('T')[0];
    }

    function parseValue(valueStr: string): string {
      if (!valueStr) return '0.00';

      // Handle Brazilian format (999,99)
      const cleanValue = valueStr.replace(/[^\d,]/g, '').replace(',', '.');
      const numValue = parseFloat(cleanValue);
      return isNaN(numValue) ? '0.00' : numValue.toFixed(2);
    }

    async function findPatientByOldId(oldId: string): Promise<string | null> {
      try {
        // Find patient by external ID (cd_paciente from CSV)
        const existingPatient = await db.select()
          .from(patients)
          .where(and(
            eq(patients.externalId, oldId.toString()),
            eq(patients.clinicId, req.user!.clinicId)
          ))
          .limit(1);

        if (existingPatient.length > 0) {
          return existingPatient[0].id;
        }

        return null;
      } catch (error) {
        console.error('Error finding patient by old ID:', error);
        return null;
      }
    }

    async function findTreatmentByOldId(oldId: string): Promise<string | null> {
      try {
        // Find treatment by external ID (cd_tratamento from CSV)
        const existingTreatment = await db.select()
          .from(treatments)
          .where(and(
            eq(treatments.externalId, oldId.toString()),
            eq(treatments.clinicId, req.user!.clinicId)
          ))
          .limit(1);

        if (existingTreatment.length > 0) {
          return existingTreatment[0].id;
        }

        return null;
      } catch (error) {
        console.error('Error finding treatment by old ID:', error);
        return null;
      }
    }

    try {
      const { type } = req.body;

      if (!req.file) {
        return res.status(400).json({ success: false, message: "No file uploaded" });
      }

      if (!type) {
        return res.status(400).json({ success: false, message: "Import type is required" });
      }

      const fileBuffer = req.file.buffer;
      const csvData: any[] = [];
      const errors: string[] = [];
      let imported = 0;
      let failed = 0;
      let skipped = 0; // Already existing records

      // Parse CSV data with encoding detection
      await new Promise<void>((resolve, reject) => {
        try {
          // Try different encodings for Brazilian CSV files
          let csvContent: string;
          try {
            csvContent = fileBuffer.toString('utf8');
            // Check if UTF-8 decoding worked properly by looking for replacement characters
            if (csvContent.includes('�')) {
              throw new Error('UTF-8 decoding failed');
            }
          } catch (error) {
            // Fallback to latin1 (ISO-8859-1) which is common for Brazilian CSV files
            csvContent = fileBuffer.toString('latin1');
          }

          const stream = Readable.from(csvContent);
          stream
            .pipe(csv({ 
              separator: ',' // Use comma separator
            }))
            .on('data', (row) => {
              // Only add rows that have at least one non-empty value
              const hasData = Object.values(row).some(value => 
                value && typeof value === 'string' && value.trim().length > 0
              );
              if (hasData) {
                csvData.push(row);
              }
            })
            .on('end', resolve)
            .on('error', reject);
        } catch (error) {
          reject(error);
        }
      });

      if (csvData.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: "CSV file is empty, has no valid data rows, or has encoding issues. Please ensure the file is properly formatted with headers and data.",
          imported: 0,
          failed: 0,
          debug: {
            fileSize: fileBuffer.length,
            rawContent: fileBuffer.toString('utf8').substring(0, 200) + '...'
          }
        });
      }

      // ID mapping for maintaining relationships
      const idMapping = new Map<string, string>();

      try {
        switch (type) {
          case 'patients':
            for (const row of csvData) {
              try {
                // Check if record already exists by external ID
                if (row.cd_paciente) {
                  const existingPatient = await db.select()
                    .from(patients)
                    .where(eq(patients.externalId, row.cd_paciente.toString()))
                    .limit(1);

                  if (existingPatient.length > 0) {
                    // Record already exists, skip it
                    idMapping.set(`patient_${row.cd_paciente}`, existingPatient[0].id);
                    skipped++;
                    continue;
                  }
                }

                // Map CSV fields to database fields based on actual CSV structure
                const patientData = {
                  fullName: row.nm_paciente?.trim(),
                  email: row.e_mail?.trim() || null,
                  cpf: row.cpf?.trim() || null,
                  rg: row.rg?.trim() || null,
                  phone: row.fone_res?.trim() || row.celular?.trim(),
                  workPhone: row.fone_trab?.trim() || null,
                  birthDate: parseDate(row.dt_nascimento),
                  birthCity: row.naturalidade?.trim() || null,
                  maritalStatus: mapMaritalStatus(row.estado_civil?.trim()),
                  // Address fields using correct schema field names
                  cep: row.cep_res?.trim() || null,
                  address: row.rua_res?.trim() || null,
                  number: null, // Not available in this CSV format
                  complement: null,
                  neighborhood: row.bairro_res?.trim() || null,
                  city: row.cidade_res?.trim() || null,
                  state: row.uf_res?.trim() || null,
                  // Responsible person fields
                  responsibleDentistId: row.cd_dentista_original ? idMapping.get(`user_${row.cd_dentista_original}`) || null : null,
                  responsibleName: row.nm_resposavel?.trim() || null,
                  responsibleCpf: row.cpf_responsavel?.trim() || null,
                  // Marketing and contact history
                  howDidYouKnowUs: row.nm_indicacao?.trim() || null,
                  howDidYouKnowUsOther: null,
                  lastVisitDate: row.dt_ultima_visita ? parseDate(row.dt_ultima_visita) : null,
                  lastContactDate: row.dt_ultimo_contato ? parseDate(row.dt_ultimo_contato) : null,
                  // Additional information in medical notes
                  medicalNotes: null, // RG and work phone now have dedicated fields
                  clinicId: req.user!.clinicId,
                  externalId: row.cd_paciente ? row.cd_paciente.toString() : null
                };

                // Validate required fields
                if (!patientData.fullName) {
                  errors.push(`Row ${csvData.indexOf(row) + 1}: Missing required field (nm_paciente)`);
                  failed++;
                  continue;
                }

                // If no residential phone, use work phone as primary
                if (!patientData.phone && patientData.workPhone) {
                  patientData.phone = patientData.workPhone;
                  patientData.workPhone = null;
                }

                const patient = await storage.createPatient(patientData);
                if (row.cd_paciente) {
                  idMapping.set(`patient_${row.cd_paciente}`, patient.id);
                }
                imported++;
              } catch (error: any) {
                errors.push(`Row ${csvData.indexOf(row) + 1}: ${error.message}`);
                failed++;
              }
            }
            break;

          case 'users':
            for (const row of csvData) {
              try {
                // Check if record already exists by external ID
                if (row.id) {
                  const existingUser = await db.select()
                    .from(users)
                    .where(eq(users.externalId, row.id.toString()))
                    .limit(1);

                  if (existingUser.length > 0) {
                    // Record already exists, skip it
                    idMapping.set(`user_${row.id}`, existingUser[0].id);
                    skipped++;
                    continue;
                  }
                }

                // Map CSV fields to database fields
                const userData = {
                  fullName: row.nome?.trim(),
                  username: row.nome_usuario?.trim(),
                  email: row.email?.trim(),
                  password: await bcrypt.hash(row.senha || '123456', 10), // Hash password
                  role: mapRole(row.funcao?.trim()),
                  clinicId: req.user!.clinicId, // Use current user's clinic
                  externalId: row.id ? row.id.toString() : null,
                  isActive: true
                };

                // Validate required fields
                if (!userData.fullName || !userData.username || !userData.email) {
                  errors.push(`Row ${csvData.indexOf(row) + 1}: Missing required fields (nome, nome_usuario, email)`);
                  failed++;
                  continue;
                }

                const user = await storage.createUser(userData);
                if (row.id) {
                  idMapping.set(`user_${row.id}`, user.id);
                }
                imported++;
              } catch (error: any) {
                errors.push(`Row ${csvData.indexOf(row) + 1}: ${error.message}`);
                failed++;
              }
            }
            break;

          case 'treatments':
            for (const row of csvData) {
              try {
                // Step 1: Check for duplicates FIRST - verify if treatment already exists
                if (row.cd_tratamento) {
                  const existingTreatment = await db.select()
                    .from(treatments)
                    .where(and(
                      eq(treatments.externalId, row.cd_tratamento.toString()),
                      eq(treatments.clinicId, req.user!.clinicId)
                    ))
                    .limit(1);

                  if (existingTreatment.length > 0) {
                    // Treatment already exists - silently skip and count as existing
                    idMapping.set(`treatment_${row.cd_tratamento}`, existingTreatment[0].id);
                    skipped++;
                    continue; // Skip to next row without any error
                  }
                }

                // Step 2: Treatment doesn't exist, proceed to find patient and create new treatment
                const patientId = idMapping.get(`patient_${row.cd_paciente}`) || 
                                 await findPatientByOldId(row.cd_paciente);

                if (!patientId) {
                  errors.push(`Row ${csvData.indexOf(row) + 1}: Patient with ID ${row.cd_paciente} not found`);
                  failed++;
                  continue;
                }

                // Create new treatment with external ID from CSV
                const treatmentData = {
                  patientId,
                  dentistId: req.user!.id,
                  clinicId: req.user!.clinicId,
                  dataInicio: parseDate(row.dt_entrada),
                  situacaoTratamento: mapTreatmentStatus(row.situacao?.trim()),
                  tituloTratamento: row.ds_obs?.trim() || 'Tratamento sem descrição',
                  externalId: row.cd_tratamento ? row.cd_tratamento.toString() : null
                };

                const treatment = await storage.createTreatment(treatmentData);

                // Store in mapping for potential use by dependent imports
                if (row.cd_tratamento) {
                  idMapping.set(`treatment_${row.cd_tratamento}`, treatment.id);
                }

                imported++;
              } catch (error: any) {
                errors.push(`Row ${csvData.indexOf(row) + 1}: ${error.message}`);
                failed++;
              }
            }
            break;

          case 'budget-items':
            for (const row of csvData) {
              try {
                // Create composite external ID from cd_tratamento + sequencial
                const compositeExternalId = row.cd_tratamento && row.sequencial ? 
                  `${row.cd_tratamento}-${row.sequencial}` : null;

                // Check if record already exists by composite external ID
                if (compositeExternalId) {
                  const existingBudgetItem = await db.select()
                    .from(budgetItems)
                    .where(eq(budgetItems.externalId, compositeExternalId))
                    .limit(1);

                  if (existingBudgetItem.length > 0) {
                    // Record already exists, skip it
                    skipped++;
                    continue;
                  }
                }

                // Find treatment by cd_tratamento from CSV using external ID lookup
                const treatmentId = idMapping.get(`treatment_${row.cd_tratamento}`) || 
                                  await findTreatmentByOldId(row.cd_tratamento);

                if (!treatmentId) {
                  errors.push(`Row ${csvData.indexOf(row) + 1}: Treatment with ID ${row.cd_tratamento} not found`);
                  failed++;
                  continue;
                }

                const budgetItemData = {
                  treatmentId,
                  descricaoOrcamento: row.descricao?.trim(),
                  valorOrcamento: parseValue(row.valor),
                  externalId: compositeExternalId
                };

                if (!budgetItemData.descricaoOrcamento) {
                  errors.push(`Row ${csvData.indexOf(row) + 1}: Missing description (descricao)`);
                  failed++;
                  continue;
                }

                await storage.createBudgetItem(budgetItemData);
                imported++;
              } catch (error: any) {
                errors.push(`Row ${csvData.indexOf(row) + 1}: ${error.message}`);
                failed++;
              }
            }
            break;

          case 'treatment-movements':
            for (const row of csvData) {
              try {
                // Check if record already exists by external ID (using the 'id' column)
                if (row.id) {
                  const existingMovement = await db.select()
                    .from(treatmentMovements)
                    .where(eq(treatmentMovements.externalId, row.id.toString()))
                    .limit(1);

                  if (existingMovement.length > 0) {
                    // Record already exists, skip it silently
                    skipped++;
                    continue;
                  }
                }

                // Find treatment by cd_tratamento from CSV using external ID lookup
                const treatmentId = idMapping.get(`treatment_${row.cd_tratamento}`) || 
                                  await findTreatmentByOldId(row.cd_tratamento);

                if (!treatmentId) {
                  errors.push(`Row ${csvData.indexOf(row) + 1}: Tratamento com ID externo ${row.cd_tratamento} não encontrado`);
                  failed++;
                  continue;
                }

                const movementData = {
                  treatmentId,
                  dataMovimentacao: parseDate(row.dt_movto),
                  descricaoAtividade: row.ds_movto?.trim(),
                  valorServico: parseValue(row.valor || '0'),
                  fotoAtividade: row.ds_arquivo?.trim() || null,
                  region: row.regiao?.trim() || null,
                  toothNumber: row.dente?.trim() || null,
                  externalId: row.id ? row.id.toString() : null
                };

                if (!movementData.descricaoAtividade) {
                  errors.push(`Row ${csvData.indexOf(row) + 1}: Missing description (ds_movto)`);
                  failed++;
                  continue;
                }

                await storage.createTreatmentMovement(movementData);
                imported++;
              } catch (error: any) {
                errors.push(`Row ${csvData.indexOf(row) + 1}: ${error.message}`);
                failed++;
              }
            }
            break;

          default:
            return res.status(400).json({ 
              success: false, 
              message: "Invalid import type",
              imported: 0,
              failed: 0
            });
        }

        const result = {
          success: true,
          message: `Import completed successfully!`,
          summary: {
            totalRows: csvData.length,
            imported: imported,
            skipped: skipped, // Already existing records
            failed: failed
          },
          errors: errors.length > 0 ? errors.slice(0, 10) : undefined // Limit to 10 errors
        };

        res.json(result);

      } catch (error: any) {
        console.error("CSV import error:", error);
        res.status(500).json({ 
          success: false, 
          message: "Internal server error during import",
          imported,
          failed,
          errors: [`Fatal error: ${error.message}`]
        });
      }

    } catch (error) {
      console.error("CSV import error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Internal server error",
        imported: 0,
        failed: 0
      });
    }
  });

  // Data migration route - migrate RG from medical notes to dedicated field
  app.post("/api/migrate-rg-data", authenticateToken, requireRole(["admin"]), async (req: AuthenticatedRequest, res) => {
    try {
      let migrated = 0;
      let processed = 0;
      const errors: string[] = [];

      // Get all patients with medical notes containing RG information
      const patientsWithRG = await db.select()
        .from(patients)
        .where(and(
          eq(patients.clinicId, req.user!.clinicId),
          isNotNull(patients.medicalNotes),
          or(
            // RG pattern: "RG: xxxxxxx"
            sql`${patients.medicalNotes} LIKE '%RG:%'`,
            // Work phone pattern: "Fone Trabalho: xxxxxxx" 
            sql`${patients.medicalNotes} LIKE '%Fone Trabalho:%'`
          )
        ));

      for (const patient of patientsWithRG) {
        try {
          processed++;
          let needsUpdate = false;
          const updates: any = {};

          if (patient.medicalNotes) {
            let cleanedNotes = patient.medicalNotes;

            // Extract RG if field is empty and notes contain RG
            if (!patient.rg && patient.medicalNotes.includes('RG:')) {
              const rgMatch = patient.medicalNotes.match(/RG:\s*([^|]+)/i);
              if (rgMatch) {
                updates.rg = rgMatch[1].trim();
                cleanedNotes = cleanedNotes.replace(/RG:\s*[^|]+\s*(\|\s*)?/gi, '');
                needsUpdate = true;
              }
            }

            // Extract work phone if field is empty and notes contain work phone
            if (!patient.workPhone && patient.medicalNotes.includes('Fone Trabalho:')) {
              const workPhoneMatch = patient.medicalNotes.match(/Fone Trabalho:\s*([^|]+)/i);
              if (workPhoneMatch) {
                updates.workPhone = workPhoneMatch[1].trim();
                cleanedNotes = cleanedNotes.replace(/Fone Trabalho:\s*[^|]+\s*(\|\s*)?/gi, '');
                needsUpdate = true;
              }
            }

            // Clean up the medical notes (remove empty pipes, trim spaces)
            if (needsUpdate) {
              cleanedNotes = cleanedNotes
                .replace(/^\s*\|\s*/, '') // Remove leading pipe
                .replace(/\s*\|\s*$/, '') // Remove trailing pipe
                .replace(/\s*\|\s*\|\s*/g, ' | ') // Fix double pipes
                .trim();

              updates.medicalNotes = cleanedNotes || null;

              // Update the patient record
              await db.update(patients)
                .set(updates)
                .where(eq(patients.id, patient.id));

              migrated++;
            }
          }
        } catch (error: any) {
          errors.push(`Patient ID ${patient.id}: ${error.message}`);
        }
      }

      res.json({
        success: true,
        message: "RG and work phone data migration completed",
        processed,
        migrated,
        errors: errors.length > 0 ? errors.slice(0, 10) : []
      });

    } catch (error: any) {
      console.error("Migration error:", error);
      res.status(500).json({
        success: false,
        message: "Error during migration",
        error: error.message
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
