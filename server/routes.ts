import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import axios from "axios";
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
import { upload, uploadCSV, uploadPatientPhoto } from "./middleware/upload";
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
  insertWhatsappConversationSchema,
  insertWhatsappMessageSchema,
} from "@shared/schema";
import { processPatientMessage } from "./whatsappAI";
import { sendWhatsAppMessage, isZApiConfigured } from "./zapiService";
import { createOrGetInstance, sendEvolutionMessage, isEvolutionConfigured, getEvolutionInstanceName } from "./evolutionService";

import multer from 'multer';

const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || "";
const ADMIN_SETUP_TOKEN = process.env.ADMIN_SETUP_TOKEN || "setup123";

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

      console.log(`Password reset requested for: ${email}${user ? ' (user found)' : ' (user not found)'}`);

      if (user) {
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await storage.createPasswordResetToken({
          userId: user.id,
          token: resetToken,
          expiresAt,
          isUsed: false
        });

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

      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }

      const resetToken = await storage.getPasswordResetToken(token);

      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      const updatedUser = await storage.updateUserPassword(resetToken.userId, hashedPassword);

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      await storage.markTokenAsUsed(token);
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

      const existingUser = await storage.getUserByEmail(adminEmail);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const clinic = await storage.createClinic({
        name: clinicName,
        email: clinicEmail,
      });

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
      const pageSize = parseInt(req.query.pageSize as string) || 5;
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
      if (error.code === '23505') {
        if (error.constraint?.includes('username')) {
          return res.status(400).json({ message: "Este nome de usuário já está em uso. Escolha outro." });
        }
        if (error.constraint?.includes('email')) {
          return res.status(400).json({ message: "Este email já está cadastrado. Use outro email." });
        }
        return res.status(400).json({ message: "Dados duplicados. Verifique as informações preenchidas." });
      }
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
      const parsedData = insertUserSchema.partial().parse(req.body);
      const updateData = { ...parsedData };

      if (updateData.password && updateData.password.trim() !== '') {
        updateData.password = await bcrypt.hash(updateData.password, 10);
      } else {
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
      if (error.code === '23505') {
        if (error.constraint?.includes('username')) {
          return res.status(400).json({ message: "Este nome de usuário já está em uso. Escolha outro." });
        }
        if (error.constraint?.includes('email')) {
          return res.status(400).json({ message: "Este email já está cadastrado. Use outro email." });
        }
        return res.status(400).json({ message: "Dados duplicados. Verifique as informações preenchidas." });
      }
      if (error.name === 'ZodError') {
        const fieldErrors = error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
        return res.status(400).json({ message: `Dados inválidos: ${fieldErrors}` });
      }
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
      if (error.code === '23505') {
        if (error.constraint?.includes('email')) {
          return res.status(400).json({ message: "Este email já está em uso por outra clínica." });
        }
        return res.status(400).json({ message: "Dados duplicados. Verifique as informações preenchidas." });
      }
      if (error.name === 'ZodError') {
        const fieldErrors = error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
        return res.status(400).json({ message: `Dados inválidos: ${fieldErrors}` });
      }
      res.status(500).json({ message: "Erro interno do servidor. Tente novamente." });
    }
  });

  const uploadLogo = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
  });

  app.post("/api/clinic/upload-logo", authenticateToken, requireRole(["admin"]), uploadLogo.single('logo'), async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Nenhum arquivo foi enviado" });
      }

      const clinicId = req.user!.clinicId;
      if (!/^[a-zA-Z0-9_-]+$/.test(clinicId)) {
        return res.status(400).json({ message: "Invalid clinic ID" });
      }

      const timestamp = Date.now();
      const safeName = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
      const filename = `${timestamp}-${safeName}`;

      let logoUrl: string;
      const isProduction = process.env.NODE_ENV === 'production';

      if (isProduction) {
        try {
          const objectStorageService = new ObjectStorageService();
          const objectPath = `${clinicId}/profile/${filename}`;
          logoUrl = await objectStorageService.uploadFile(req.file.buffer, objectPath, req.file.mimetype);

          const clinic = await storage.getClinicById(clinicId);
          if (clinic?.logoUrl && clinic.logoUrl.startsWith('http')) {
            try {
              await objectStorageService.deleteFile(clinic.logoUrl);
            } catch (deleteError) {
              console.error("Error deleting old logo:", deleteError);
            }
          }
        } catch (storageError: any) {
          console.error("Object storage error:", storageError);
          return res.status(500).json({
            message: "Falha ao processar upload do logo.",
            error: storageError.message
          });
        }
      } else {
        const uploadDir = path.join(process.cwd(), 'uploads', clinicId, 'profile');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        const clinic = await storage.getClinicById(clinicId);
        if (clinic?.logoUrl && clinic.logoUrl.startsWith('/uploads/')) {
          try {
            const oldFilePath = path.join(process.cwd(), clinic.logoUrl.replace(/^\//, ''));
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
            }
          } catch (deleteError) {
            console.error("Error deleting old logo:", deleteError);
          }
        }

        const targetPath = path.join(uploadDir, filename);
        fs.writeFileSync(targetPath, req.file.buffer);
        logoUrl = `/uploads/${clinicId}/profile/${filename}`;
      }

      const updatedClinic = await storage.updateClinic(clinicId, { logoUrl });
      res.json({ logoUrl, clinic: updatedClinic });
    } catch (error: any) {
      console.error("Upload logo error:", error);
      res.status(500).json({ message: "Erro ao fazer upload do logo", error: error.message });
    }
  });

  // Upload patient photo
  app.post("/api/patients/:id/photo", authenticateToken, requireRole(["admin", "secretary"]), uploadPatientPhoto.single('photo'), async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Nenhum arquivo foi enviado" });
      }

      const maxSize = 5 * 1024 * 1024;
      if (req.file.size > maxSize) {
        return res.status(400).json({ message: "O arquivo é muito grande. Tamanho máximo: 5MB" });
      }

      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ message: "Tipo de arquivo inválido. Use: JPG, PNG ou WEBP" });
      }

      const clinicId = req.user!.clinicId;
      const patientId = req.params.id;

      if (!/^[a-zA-Z0-9_-]+$/.test(clinicId) || !/^[a-zA-Z0-9_-]+$/.test(patientId)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }

      const timestamp = Date.now();
      const safeName = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
      const filename = `${timestamp}-${safeName}`;

      let photoUrl: string;
      const isProduction = process.env.NODE_ENV === 'production';

      if (isProduction) {
        try {
          const objectStorageService = new ObjectStorageService();
          const objectPath = `${clinicId}/patients/${patientId}/${filename}`;
          photoUrl = await objectStorageService.uploadFile(req.file.buffer, objectPath, req.file.mimetype);
        } catch (storageError: any) {
            console.error("Object storage error (NÃO HÁ FALLBACK):", storageError);
            return res.status(500).json({ 
                message: "Falha ao processar upload no GCS.",
                error: storageError.message 
            });
        }
      } else {
        const uploadDir = path.join(process.cwd(), 'uploads', clinicId, 'patients', patientId);
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        const targetPath = path.join(uploadDir, filename);
        fs.writeFileSync(targetPath, req.file.buffer);
        photoUrl = `/uploads/${clinicId}/patients/${patientId}/${filename}`;
      }

      const patient = await storage.getPatientById(req.params.id, req.user!.clinicId);
      if (!patient) {
        return res.status(404).json({ message: "Paciente não encontrado" });
      }

      if (patient.photoUrl) {
        if (patient.photoUrl.startsWith('gcs://') || patient.photoUrl.startsWith('http')) {
          try {
            const objectStorageService = new ObjectStorageService();
            await objectStorageService.deleteFile(patient.photoUrl);
          } catch (deleteError) {
            console.error("Error deleting old photo from object storage:", deleteError);
          }
        } else if (patient.photoUrl.startsWith('/uploads/')) {
          try {
            const oldFilePath = path.join(process.cwd(), patient.photoUrl.replace(/^\//, ''));
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
      res.status(500).json({ message: "Erro ao fazer upload da foto", error: error.message });
    }
  });

  // Public route to get clinic branding for login page
  app.get("/api/clinic/branding/:email", async (req, res) => {
    try {
      const { email } = req.params;
      const [clinic] = await db.select({ 
        name: clinics.name, 
        logoUrl: clinics.logoUrl 
      }).from(clinics).where(eq(clinics.email, email)).limit(1);

      if (clinic) {
        res.json({ clinicName: clinic.name, logoUrl: clinic.logoUrl });
      } else {
        res.json({ clinicName: "DentiCare", logoUrl: null });
      }
    } catch (error) {
      console.error("Get clinic branding error:", error);
      res.json({ clinicName: "DentiCare", logoUrl: null });
    }
  });

  // Patient routes
  app.get("/api/patients", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 50;
      const search = (req.query.search as string)?.trim() || '';

      const validPage = Math.max(1, page);
      const validPageSize = Math.min(Math.max(1, pageSize), 100);
      const offset = (validPage - 1) * validPageSize;

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

      const [{ count: totalCount }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(patients)
        .where(whereConditions);

      const totalPages = Math.ceil(totalCount / validPageSize);

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
      const nullableFields = ['birthDate', 'lastVisitDate', 'lastContactDate', 'responsibleDentistId', 'cpf', 'email', 'birthCity', 'maritalStatus', 'cep', 'address', 'number', 'complement', 'neighborhood', 'city', 'state', 'responsibleName', 'responsibleCpf', 'howDidYouKnowUs', 'howDidYouKnowUsOther'] as const;
      nullableFields.forEach(field => {
        if ((updateData as any)[field] === "" || (updateData as any)[field] === undefined) {
          (updateData as any)[field] = null;
        }
      });

      if (updateData.photoUrl === null) {
        const currentPatient = await storage.getPatientById(req.params.id, req.user!.clinicId);
        if (currentPatient?.photoUrl) {
          if (currentPatient.photoUrl.startsWith('gcs://') || currentPatient.photoUrl.startsWith('http')) {
            try {
              const objectStorageService = new ObjectStorageService();
              await objectStorageService.deleteFile(currentPatient.photoUrl);
            } catch (deleteError) {
              console.error("Error deleting photo from object storage:", deleteError);
            }
          } else if (currentPatient.photoUrl.startsWith('/uploads/')) {
            try {
              const filePath = path.join(process.cwd(), currentPatient.photoUrl.replace(/^\//, ''));
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
      if (requestData.scheduledDate) {
        requestData.scheduledDate = new Date(requestData.scheduledDate);
      }

      if (requestData.duration) {
        if (requestData.duration < 5) {
          return res.status(400).json({ message: "A duração mínima do agendamento é de 5 minutos." });
        }
        if (requestData.scheduledDate) {
          const scheduledDateTime = new Date(requestData.scheduledDate);
          const nextDayStart = new Date(scheduledDateTime);
          nextDayStart.setHours(24, 0, 0, 0);
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
      if (updateData.scheduledDate) {
        updateData.scheduledDate = new Date(updateData.scheduledDate);
      }

      if (updateData.duration !== undefined) {
        if (updateData.duration < 5) {
          return res.status(400).json({ message: "A duração mínima do agendamento é de 5 minutos." });
        }
        const scheduledDate = updateData.scheduledDate || (await storage.getAppointmentById(req.params.id, req.user!.clinicId))?.scheduledDate;
        if (scheduledDate) {
          const scheduledDateTime = new Date(scheduledDate);
          const nextDayStart = new Date(scheduledDateTime);
          nextDayStart.setHours(24, 0, 0, 0);
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
      const clinicId = req.user!.clinicId;
      const patientId = req.body.patientId;

      if (!/^[a-zA-Z0-9_-]+$/.test(clinicId) || !/^[a-zA-Z0-9_-]+$/.test(patientId)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }

      const tempRecordId = crypto.randomBytes(16).toString('hex');
      const timestamp = Date.now();
      const imagePaths: string[] = [];
      const isProduction = process.env.NODE_ENV === 'production';

      if (files && files.length > 0) {
        if (isProduction) {
          const objectStorageService = new ObjectStorageService();
          for (const file of files) {
            try {
              const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
              const filename = `${timestamp}-${safeName}`;
              const objectPath = `${clinicId}/medical-records/${patientId}/${tempRecordId}/${filename}`;
              const url = await objectStorageService.uploadFile(file.buffer, objectPath, file.mimetype);
              imagePaths.push(url);
            } catch (uploadError) {
              console.error("Error uploading medical record image:", uploadError);
            }
          }
        } else {
          const uploadDir = path.join(process.cwd(), 'uploads', clinicId, 'medical-records', patientId, tempRecordId);
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          for (const file of files) {
            const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
            const filename = `${timestamp}-${safeName}`;
            const targetPath = path.join(uploadDir, filename);
            fs.writeFileSync(targetPath, file.buffer);
            imagePaths.push(`/uploads/${clinicId}/medical-records/${patientId}/${tempRecordId}/${filename}`);
          }
        }
      }

      const recordData = insertMedicalRecordSchema.parse({
        ...req.body,
        clinicId,
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
      const { responses } = req.body;
      if (responses.length > 0) {
        const treatmentId = responses[0].treatmentId;
        await storage.deleteAnamnesisResponsesByTreatment(treatmentId);
      }
      const savedResponses = [];
      for (const responseData of responses) {
        if (responseData.response && responseData.response.trim()) {
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

  // WhatsApp simulation route (Maintain for legacy/test reasons)
  app.post("/api/whatsapp/send", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { phone, message, type } = req.body;
      console.log(`📱 WhatsApp Message Sent (${type})`);
      console.log(`To: ${phone}`);
      console.log(`Message: ${message}`);
      res.json({ success: true, message: "WhatsApp message sent successfully (simulated)" });
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
      const treatmentData = { ...result.data, clinicId: authReq.user!.clinicId, dentistId: authReq.user!.id };
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
      const treatmentsData = await storage.getTreatmentsByPatient(patientId, authReq.user!.clinicId);
      res.json(treatmentsData);
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
      const items = await storage.getBudgetItemsByTreatment(treatmentId);
      res.json(items);
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
      const currentMovement = await storage.getTreatmentMovementById(id);
      if (!currentMovement) {
        return res.status(404).json({ message: "Treatment movement not found" });
      }

      const movementData = { ...req.body };
      delete movementData.removePhoto;
      const result = insertTreatmentMovementSchema.partial().safeParse(movementData);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid treatment movement data", errors: result.error.errors });
      }

      const validatedData = result.data;
      const removePhoto = String(req.body.removePhoto).toLowerCase() === 'true';

      if (req.file) {
        if (currentMovement.fotoAtividade) {
          if (currentMovement.fotoAtividade.startsWith('gcs://') || currentMovement.fotoAtividade.startsWith('http')) {
            try {
              const objectStorageService = new ObjectStorageService();
              await objectStorageService.deleteFile(currentMovement.fotoAtividade);
            } catch (deleteError) {
              console.error("Error deleting old photo from object storage:", deleteError);
            }
          } else if (currentMovement.fotoAtividade.startsWith('/uploads/')) {
            try {
              const filePath = path.join(process.cwd(), currentMovement.fotoAtividade.replace(/^\//, ''));
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            } catch (deleteError) {
              console.error("Error deleting old photo from filesystem:", deleteError);
            }
          }
        }
        validatedData.fotoAtividade = `/uploads/${req.file.filename}`;
      } else if (removePhoto && currentMovement.fotoAtividade) {
        if (currentMovement.fotoAtividade.startsWith('gcs://') || currentMovement.fotoAtividade.startsWith('http')) {
          try {
            const objectStorageService = new ObjectStorageService();
            await objectStorageService.deleteFile(currentMovement.fotoAtividade);
          } catch (deleteError) {
            console.error("Error deleting photo from object storage:", deleteError);
          }
        } else if (currentMovement.fotoAtividade.startsWith('/uploads/')) {
          try {
            const filePath = path.join(process.cwd(), currentMovement.fotoAtividade.replace(/^\//, ''));
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (deleteError) {
            console.error("Error deleting photo from filesystem:", deleteError);
          }
        }
        validatedData.fotoAtividade = null;
      }

      const movement = await storage.updateTreatmentMovement(id, validatedData);
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
      if (cleaned.includes('/')) {
        const dateTimeParts = cleaned.split(' ');
        const datePart = dateTimeParts[0];
        const parts = datePart.split('/');
        if (parts.length === 3) {
          const [day, month, year] = parts;
          const fullYear = year.length === 2 ? `20${year}` : year;
          const dayNum = parseInt(day, 10);
          const monthNum = parseInt(month, 10);
          const yearNum = parseInt(fullYear, 10);
          if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900) {
            return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
        }
      }
      if (cleaned.includes('-') && cleaned.length >= 8) {
        const parts = cleaned.split('-');
        if (parts.length === 3 && parts[0].length <= 2) {
          const [day, month, year] = parts;
          const fullYear = year.length === 2 ? `20${year}` : year;
          const dayNum = parseInt(day, 10);
          const monthNum = parseInt(month, 10);
          const yearNum = parseInt(fullYear, 10);
          if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900) {
            return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
        }
      }
      return new Date().toISOString().split('T')[0];
    }

    function parseValue(valueStr: string): string {
      if (!valueStr) return '0.00';
      const cleanValue = valueStr.replace(/[^\d,]/g, '').replace(',', '.');
      const numValue = parseFloat(cleanValue);
      return isNaN(numValue) ? '0.00' : numValue.toFixed(2);
    }

    async function findPatientByOldId(oldId: string): Promise<string | null> {
      try {
        const existingPatient = await db.select()
          .from(patients)
          .where(and(
            eq(patients.externalId, oldId.toString()),
            eq(patients.clinicId, req.user!.clinicId)
          ))
          .limit(1);
        return existingPatient.length > 0 ? existingPatient[0].id : null;
      } catch (error) {
        console.error('Error finding patient by old ID:', error);
        return null;
      }
    }

    async function findTreatmentByOldId(oldId: string): Promise<string | null> {
      try {
        const existingTreatment = await db.select()
          .from(treatments)
          .where(and(
            eq(treatments.externalId, oldId.toString()),
            eq(treatments.clinicId, req.user!.clinicId)
          ))
          .limit(1);
        return existingTreatment.length > 0 ? existingTreatment[0].id : null;
      } catch (error) {
        console.error('Error finding treatment by old ID:', error);
        return null;
      }
    }

    try {
      const { type } = req.body;
      if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
      if (!type) return res.status(400).json({ success: false, message: "Import type is required" });

      const fileBuffer = req.file.buffer;
      const csvData: any[] = [];
      const errors: string[] = [];
      let imported = 0;
      let failed = 0;
      let skipped = 0;

      await new Promise<void>((resolve, reject) => {
        try {
          let csvContent: string;
          try {
            csvContent = fileBuffer.toString('utf8');
            if (csvContent.includes('')) throw new Error('UTF-8 decoding failed');
          } catch (error) {
            csvContent = fileBuffer.toString('latin1');
          }
          const stream = Readable.from(csvContent);
          stream.pipe(csv({ separator: ',' }))
            .on('data', (row) => {
              const hasData = Object.values(row).some(value => value && typeof value === 'string' && value.trim().length > 0);
              if (hasData) csvData.push(row);
            })
            .on('end', resolve)
            .on('error', reject);
        } catch (error) { reject(error); }
      });

      if (csvData.length === 0) {
        return res.status(400).json({ success: false, message: "CSV file is empty or formatted incorrectly." });
      }

      const idMapping = new Map<string, string>();

      switch (type) {
        case 'patients':
          for (const row of csvData) {
            try {
              if (row.cd_paciente) {
                const existing = await db.select().from(patients).where(eq(patients.externalId, row.cd_paciente.toString())).limit(1);
                if (existing.length > 0) {
                  idMapping.set(`patient_${row.cd_paciente}`, existing[0].id);
                  skipped++;
                  continue;
                }
              }
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
                cep: row.cep_res?.trim() || null,
                address: row.rua_res?.trim() || null,
                number: null,
                complement: null,
                neighborhood: row.bairro_res?.trim() || null,
                city: row.cidade_res?.trim() || null,
                state: row.uf_res?.trim() || null,
                responsibleDentistId: row.cd_dentista_original ? idMapping.get(`user_${row.cd_dentista_original}`) || null : null,
                responsibleName: row.nm_resposavel?.trim() || null,
                responsibleCpf: row.cpf_responsavel?.trim() || null,
                howDidYouKnowUs: row.nm_indicacao?.trim() || null,
                howDidYouKnowUsOther: null,
                lastVisitDate: row.dt_ultima_visita ? parseDate(row.dt_ultima_visita) : null,
                lastContactDate: row.dt_ultimo_contato ? parseDate(row.dt_ultimo_contato) : null,
                clinicId: req.user!.clinicId,
                externalId: row.cd_paciente ? row.cd_paciente.toString() : null
              };
              if (!patientData.fullName) throw new Error("Missing nm_paciente");
              const patient = await storage.createPatient(patientData);
              if (row.cd_paciente) idMapping.set(`patient_${row.cd_paciente}`, patient.id);
              imported++;
            } catch (error: any) { errors.push(`Row ${csvData.indexOf(row) + 1}: ${error.message}`); failed++; }
          }
          break;
        case 'users':
          for (const row of csvData) {
            try {
              if (row.id) {
                const existing = await db.select().from(users).where(eq(users.externalId, row.id.toString())).limit(1);
                if (existing.length > 0) {
                  idMapping.set(`user_${row.id}`, existing[0].id);
                  skipped++;
                  continue;
                }
              }
              const userData = {
                fullName: row.nome?.trim(),
                username: row.nome_usuario?.trim(),
                email: row.email?.trim(),
                password: await bcrypt.hash(row.senha || '123456', 10),
                role: mapRole(row.funcao?.trim()),
                clinicId: req.user!.clinicId,
                externalId: row.id ? row.id.toString() : null,
                isActive: true
              };
              if (!userData.fullName || !userData.username || !userData.email) throw new Error("Missing user data");
              const user = await storage.createUser(userData);
              if (row.id) idMapping.set(`user_${row.id}`, user.id);
              imported++;
            } catch (error: any) { errors.push(`Row ${csvData.indexOf(row) + 1}: ${error.message}`); failed++; }
          }
          break;
        case 'treatments':
          for (const row of csvData) {
            try {
              if (row.cd_tratamento) {
                const existing = await db.select().from(treatments).where(and(eq(treatments.externalId, row.cd_tratamento.toString()), eq(treatments.clinicId, req.user!.clinicId))).limit(1);
                if (existing.length > 0) {
                  idMapping.set(`treatment_${row.cd_tratamento}`, existing[0].id);
                  skipped++;
                  continue;
                }
              }
              const patientId = idMapping.get(`patient_${row.cd_paciente}`) || await findPatientByOldId(row.cd_paciente);
              if (!patientId) throw new Error(`Patient ${row.cd_paciente} not found`);
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
              if (row.cd_tratamento) idMapping.set(`treatment_${row.cd_tratamento}`, treatment.id);
              imported++;
            } catch (error: any) { errors.push(`Row ${csvData.indexOf(row) + 1}: ${error.message}`); failed++; }
          }
          break;
        case 'budget-items':
          for (const row of csvData) {
            try {
              const compositeExternalId = row.cd_tratamento && row.sequencial ? `${row.cd_tratamento}-${row.sequencial}` : null;
              if (compositeExternalId) {
                const existing = await db.select().from(budgetItems).where(eq(budgetItems.externalId, compositeExternalId)).limit(1);
                if (existing.length > 0) { skipped++; continue; }
              }
              const treatmentId = idMapping.get(`treatment_${row.cd_tratamento}`) || await findTreatmentByOldId(row.cd_tratamento);
              if (!treatmentId) throw new Error(`Treatment ${row.cd_tratamento} not found`);
              const budgetItemData = {
                treatmentId,
                descricaoOrcamento: row.descricao?.trim(),
                valorOrcamento: parseValue(row.valor),
                externalId: compositeExternalId
              };
              await storage.createBudgetItem(budgetItemData);
              imported++;
            } catch (error: any) { errors.push(`Row ${csvData.indexOf(row) + 1}: ${error.message}`); failed++; }
          }
          break;
        case 'treatment-movements':
          for (const row of csvData) {
            try {
              if (row.id) {
                const existing = await db.select().from(treatmentMovements).where(eq(treatmentMovements.externalId, row.id.toString())).limit(1);
                if (existing.length > 0) { skipped++; continue; }
              }
              const treatmentId = idMapping.get(`treatment_${row.cd_tratamento}`) || await findTreatmentByOldId(row.cd_tratamento);
              if (!treatmentId) throw new Error(`Treatment ${row.cd_tratamento} not found`);
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
              await storage.createTreatmentMovement(movementData);
              imported++;
            } catch (error: any) { errors.push(`Row ${csvData.indexOf(row) + 1}: ${error.message}`); failed++; }
          }
          break;
      }
      res.json({ success: true, summary: { totalRows: csvData.length, imported, skipped, failed }, errors: errors.slice(0, 10) });
    } catch (error) { res.status(500).json({ success: false, message: "Internal server error" }); }
  });

  // Data migration route
  app.post("/api/migrate-rg-data", authenticateToken, requireRole(["admin"]), async (req: AuthenticatedRequest, res) => {
    try {
      let migrated = 0;
      const patientsWithRG = await db.select().from(patients).where(and(eq(patients.clinicId, req.user!.clinicId), isNotNull(patients.medicalNotes)));
      for (const patient of patientsWithRG) {
        if (patient.medicalNotes) {
          let needsUpdate = false;
          const updates: any = {};
          let cleanedNotes = patient.medicalNotes;
          if (!patient.rg && patient.medicalNotes.includes('RG:')) {
            const rgMatch = patient.medicalNotes.match(/RG:\s*([^|]+)/i);
            if (rgMatch) { updates.rg = rgMatch[1].trim(); cleanedNotes = cleanedNotes.replace(/RG:\s*[^|]+\s*(\|\s*)?/gi, ''); needsUpdate = true; }
          }
          if (needsUpdate) {
            updates.medicalNotes = cleanedNotes.trim() || null;
            await db.update(patients).set(updates).where(eq(patients.id, patient.id));
            migrated++;
          }
        }
      }
      res.json({ success: true, migrated });
    } catch (error) { res.status(500).json({ success: false }); }
  });

  // ========================================
  // WhatsApp Integration Routes (Z-API + Gemini)
  // ========================================

  // Webhook for receiving WhatsApp messages from Z-API
  // NOTE: This route does NOT require authenticateToken - it receives data from Z-API servers
  app.post("/webhook/zapi", async (req, res) => {
    console.log("\n--- [DEBUG] INÍCIO DO WEBHOOK Z-API ---");
    console.log("Conteúdo recebido (req.body):", JSON.stringify(req.body, null, 2));

    // Optional: Validate Z-API Client-Token header for security
    if (ZAPI_CLIENT_TOKEN) {
      const clientToken = req.headers["client-token"] as string;
      if (clientToken !== ZAPI_CLIENT_TOKEN) {
        console.warn("⚠️ [Z-API Webhook] Invalid or missing Client-Token header");
        return res.status(403).json({ error: "Invalid Client-Token" });
      }
      console.log("✅ [Z-API Webhook] Client-Token validated successfully");
    }

    try {
      const receivedMessage = req.body;
      
      if (!receivedMessage || receivedMessage.isStatusReply) {
        return res.status(200).json({ received: true });
      }

      const phone = receivedMessage.phone || receivedMessage.from;
      const messageText = receivedMessage.text?.message || receivedMessage.body || receivedMessage.message;
      const zapiMessageId = receivedMessage.messageId || receivedMessage.id?.id;

      if (!phone || !messageText) {
        console.warn("⚠️ [DEBUG] Campos obrigatórios ausentes (phone ou messageText).");
        return res.status(200).json({ received: true, warning: "Missing required fields" });
      }

      const normalizedPhone = phone.replace(/\D/g, "");
      console.log(`📱 [DEBUG] Paciente: ${normalizedPhone} | Mensagem: "${messageText}"`);

      const clinicId = process.env.WHATSAPP_CLINIC_ID || "1";
      console.log(`🏥 [DEBUG] Clinic ID em uso: ${clinicId}`);

      let conversation = await storage.getWhatsappConversationByPhone(clinicId, normalizedPhone);

      if (!conversation) {
        console.log("🆕 [DEBUG] Conversa não encontrada. Criando nova conversa...");
        conversation = await storage.createWhatsappConversation({
          clinicId,
          phone: normalizedPhone,
          status: 'ai',
        });
      }
      console.log(`✅ [DEBUG] ID da Conversa no Banco: ${conversation.id} | Status: ${conversation.status}`);

      const savedMsg = await storage.createWhatsappMessage({
        conversationId: conversation.id,
        sender: 'patient',
        text: messageText,
        externalMessageId: zapiMessageId,
      });
      console.log(`💾 [DEBUG] Mensagem do paciente salva. ID: ${savedMsg.id}`);

      if (conversation.status === 'ai') {
        console.log("🤖 [DEBUG] Modo IA ativo. Buscando histórico e chamando Gemini...");

        const messages = await storage.getWhatsappMessagesByConversation(conversation.id);
        const history = messages.slice(-10).map(m => ({
          role: m.sender === 'patient' ? 'patient' : 'model',
          text: m.text,
        }));

        const aiResponse = await processPatientMessage(messageText, history);
        console.log("🧠 [DEBUG] Resposta do Gemini:", JSON.stringify(aiResponse, null, 2));

        const savedAiMsg = await storage.createWhatsappMessage({
          conversationId: conversation.id,
          sender: 'ai',
          text: aiResponse.message,
          extractedIntent: JSON.stringify(aiResponse.extractedIntent),
        });
        console.log(`💾 [DEBUG] Mensagem da IA salva. ID: ${savedAiMsg.id}`);

        if (aiResponse.extractedIntent.intent === 'falar_com_humano') {
          console.log("👤 [DEBUG] Intenção de falar com humano detectada. Alterando status...");
          await storage.updateWhatsappConversation(conversation.id, { status: 'human' });
        }

        const sendResult = await sendWhatsAppMessage(normalizedPhone, aiResponse.message);
        if (!sendResult.success) {
          console.error("❌ [DEBUG] Falha ao enviar resposta via Z-API:", sendResult.error);
        }
      } else {
        console.log("👤 [DEBUG] Conversa em modo HUMANO. IA não responderá.");
      }

      console.log("--- [DEBUG] FIM DO WEBHOOK Z-API COM SUCESSO ---\n");
      res.status(200).json({ received: true });

    } catch (error: any) {
      console.error("🔥 [DEBUG] ERRO FATAL NO WEBHOOK Z-API:", error);
      res.status(200).json({ received: true, error: "Internal processing error" });
    }
  });

  // ========================================
  // Evolution API Integration Routes
  // ========================================

  // ============================================================
  // WEBHOOK EVOLUTION API - VERSÃO SIMPLIFICADA PARA DIAGNÓSTICO
  // ============================================================
  app.post("/webhook/evolution", (req, res) => {
    // RESPOSTA IMEDIATA - Evita timeout do Railway
    res.status(200).send("OK");
    
    // LOG APÓS RESPOSTA - Não bloqueia o retorno
    console.log("\n");
    console.log("########################################");
    console.log("🔔 WEBHOOK RECEBIDO!");
    console.log("########################################");
    console.log("⏰ Timestamp:", new Date().toISOString());
    console.log("📦 Body:", JSON.stringify(req.body, null, 2));
    console.log("########################################\n");
  });
  
  // ============================================================
  // WEBHOOK EVOLUTION API - VERSÃO COMPLETA (COMENTADA PARA TESTE)
  // ============================================================
  // Descomente esta rota e comente a acima quando o diagnóstico estiver OK
  /*
  app.post("/webhook/evolution-full", async (req, res) => {
    console.log("\n========================================");
    console.log("📩 [WEBHOOK] Recebi algo do Webhook:", JSON.stringify(req.body, null, 2));
    console.log("========================================\n");

    try {
      const data = req.body;
      
      if (!data || data.event !== "messages.upsert") {
        console.log(`ℹ️ [Evolution] Evento ignorado: ${data?.event || 'undefined'}`);
        return res.status(200).json({ received: true });
      }

      const messageData = data.data;
      if (!messageData || messageData.key?.fromMe) {
        console.log(`ℹ️ [Evolution] Mensagem própria ignorada`);
        return res.status(200).json({ received: true });
      }

      const remoteJid = messageData.key?.remoteJid || "";
      
      if (!remoteJid.endsWith("@s.whatsapp.net")) {
        console.log(`🚫 [Evolution] Mensagem de GRUPO ignorada: ${remoteJid}`);
        return res.status(200).json({ received: true, ignored: "group_message" });
      }
      
      const phone = remoteJid.replace("@s.whatsapp.net", "");
      
      const messageText = messageData.message?.conversation || 
                          messageData.message?.extendedTextMessage?.text ||
                          messageData.data?.message?.conversation ||
                          messageData.data?.message?.extendedTextMessage?.text || "";
      const evolutionMessageId = messageData.key?.id;

      if (!phone || !messageText) {
        console.warn("⚠️ [Evolution Webhook] Campos obrigatórios ausentes (phone ou messageText).");
        return res.status(200).json({ received: true, warning: "Missing required fields" });
      }

      const normalizedPhone = phone.replace(/\D/g, "");
      console.log(`📱 [Evolution] Paciente: ${normalizedPhone} | Mensagem: "${messageText}"`);

      const clinicId = process.env.WHATSAPP_CLINIC_ID || "1";
      console.log(`🏥 [Evolution] Clinic ID em uso: ${clinicId}`);

      let conversation = await storage.getWhatsappConversationByPhone(clinicId, normalizedPhone);

      if (!conversation) {
        console.log("🆕 [Evolution] Conversa não encontrada. Criando nova conversa...");
        conversation = await storage.createWhatsappConversation({
          clinicId,
          phone: normalizedPhone,
          status: 'ai',
        });
      }
      console.log(`✅ [Evolution] ID da Conversa no Banco: ${conversation.id} | Status: ${conversation.status}`);

      const savedMsg = await storage.createWhatsappMessage({
        conversationId: conversation.id,
        sender: 'patient',
        text: messageText,
        externalMessageId: evolutionMessageId,
      });
      console.log(`💾 [Evolution] Mensagem do paciente salva. ID: ${savedMsg.id}`);

      if (conversation.status === 'ai') {
        console.log("🤖 [Evolution] Modo IA ativo. Buscando histórico e chamando Gemini...");

        const messages = await storage.getWhatsappMessagesByConversation(conversation.id);
        const history = messages.slice(-10).map(m => ({
          role: m.sender === 'patient' ? 'patient' : 'model',
          text: m.text,
        }));

        const aiResponse = await processPatientMessage(messageText, history);
        console.log("🧠 [Evolution] Resposta do Gemini:", JSON.stringify(aiResponse, null, 2));

        const savedAiMsg = await storage.createWhatsappMessage({
          conversationId: conversation.id,
          sender: 'ai',
          text: aiResponse.message,
          extractedIntent: JSON.stringify(aiResponse.extractedIntent),
        });
        console.log(`💾 [Evolution] Mensagem da IA salva. ID: ${savedAiMsg.id}`);

        if (aiResponse.extractedIntent.intent === 'falar_com_humano') {
          console.log("👤 [Evolution] Intenção de falar com humano detectada. Alterando status...");
          await storage.updateWhatsappConversation(conversation.id, { status: 'human' });
        }

        const sendResult = await sendEvolutionMessage(normalizedPhone, aiResponse.message);
        if (!sendResult.success) {
          console.error("❌ [Evolution] Falha ao enviar resposta:", sendResult.error);
        }
      } else {
        console.log("👤 [Evolution] Conversa em modo HUMANO. IA não responderá.");
      }

      console.log("--- [DEBUG] FIM DO WEBHOOK EVOLUTION COM SUCESSO ---\n");
      res.status(200).json({ received: true });

    } catch (error: any) {
      console.error("🔥 [Evolution] ERRO FATAL NO WEBHOOK:", error);
      res.status(200).json({ received: true, error: "Internal processing error" });
    }
  });
  */

  // Admin route to setup WhatsApp via Evolution API (QR Code generation)
  // NOTE: Protected by simple query param token (no JWT required)
  // Usage: GET /admin/setup-whatsapp?token=YOUR_ADMIN_SETUP_TOKEN
  app.get("/admin/setup-whatsapp", async (req, res) => {
    const token = req.query.token as string;
    
    // Prevenir cache de QR Codes antigos
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    if (!token || token !== ADMIN_SETUP_TOKEN) {
      console.warn("⚠️ [Evolution Setup] Token inválido ou ausente");
      return res.status(403).send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Acesso Negado</title>
          <style>
            body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
            .error { color: #dc2626; background: #fef2f2; padding: 20px; border-radius: 8px; }
          </style>
        </head>
        <body>
          <h1>🔒 Acesso Negado</h1>
          <div class="error">
            <p>Token inválido ou ausente.</p>
            <p>Use: <code>/admin/setup-whatsapp?token=SEU_TOKEN</code></p>
          </div>
        </body>
        </html>
      `);
    }
    
    console.log("🔧 [Evolution] Iniciando setup do WhatsApp...");

    if (!isEvolutionConfigured()) {
      return res.status(503).send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Setup WhatsApp - Erro</title>
          <style>
            body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
            .error { color: #dc2626; background: #fef2f2; padding: 20px; border-radius: 8px; }
          </style>
        </head>
        <body>
          <h1>⚠️ Evolution API não configurada</h1>
          <div class="error">
            <p>Configure as variáveis de ambiente:</p>
            <code>EVO_URL</code> e <code>EVO_KEY</code>
          </div>
        </body>
        </html>
      `);
    }

    try {
      const result = await createOrGetInstance();

      if (!result.success) {
        return res.status(500).send(`
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Setup WhatsApp - Erro</title>
            <style>
              body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
              .error { color: #dc2626; background: #fef2f2; padding: 20px; border-radius: 8px; }
            </style>
          </head>
          <body>
            <h1>❌ Erro ao configurar instância</h1>
            <div class="error"><p>${result.error}</p></div>
          </body>
          </html>
        `);
      }

      // Log URL for user access
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5000';
      const fullUrl = `${protocol}://${host}/admin/setup-whatsapp?token=${ADMIN_SETUP_TOKEN}`;
      console.log(`\n🔗 [Evolution] URL de acesso ao QR Code:`);
      console.log(`   ${fullUrl}\n`);

      if (result.status === "connected") {
        return res.send(`
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>WhatsApp Conectado - Clínica Denticare</title>
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { 
                font-family: 'Segoe UI', system-ui, sans-serif; 
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
              }
              .container {
                background: #ffffff;
                padding: 40px;
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                text-align: center;
                max-width: 500px;
                width: 100%;
              }
              h1 { color: #16a34a; font-size: 28px; margin-bottom: 20px; }
              .success-icon { font-size: 80px; margin-bottom: 20px; }
              .message { color: #374151; font-size: 18px; line-height: 1.6; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success-icon">✅</div>
              <h1>WhatsApp Conectado!</h1>
              <p class="message">
                A instância já está conectada e operacional.<br>
                Você pode começar a receber mensagens.
              </p>
            </div>
          </body>
          </html>
        `);
      }

      // Clean and prepare base64 string
      let qrBase64 = result.qrCode || "";
      
      // Remove any line breaks or whitespace
      qrBase64 = qrBase64.replace(/[\r\n\s]/g, "");
      
      // Remove data URI prefix if already present (to avoid duplication)
      if (qrBase64.startsWith("data:image")) {
        qrBase64 = qrBase64.replace(/^data:image\/[a-z]+;base64,/, "");
      }
      
      console.log(`📊 [Evolution] Base64 limpo: ${qrBase64.length} caracteres`);
      console.log(`📊 [Evolution] Primeiros 50 chars: ${qrBase64.substring(0, 50)}...`);

      // Fallback if no QR code
      if (!qrBase64 || qrBase64.length < 100) {
        console.error(`❌ [Evolution] QR Code base64 inválido ou vazio!`);
        return res.status(500).send(`
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="refresh" content="10">
            <title>Erro - Clínica Denticare</title>
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { 
                font-family: 'Segoe UI', system-ui, sans-serif; 
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                color: #fff;
              }
              .container {
                background: #dc2626;
                padding: 40px;
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                text-align: center;
                max-width: 500px;
                width: 100%;
              }
              h1 { font-size: 28px; margin-bottom: 20px; }
              .error-icon { font-size: 80px; margin-bottom: 20px; }
              .message { font-size: 16px; line-height: 1.6; margin-bottom: 20px; }
              .refresh-info { font-size: 14px; opacity: 0.8; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="error-icon">⚠️</div>
              <h1>QR Code não disponível</h1>
              <p class="message">
                Não foi possível gerar o QR Code.<br>
                A página será atualizada automaticamente em 10 segundos.
              </p>
              <p class="refresh-info">Status: ${result.status || 'unknown'}</p>
            </div>
          </body>
          </html>
        `);
      }

      // Build the complete data URI
      const dataUri = `data:image/png;base64,${qrBase64}`;

      res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
          <meta http-equiv="Pragma" content="no-cache">
          <meta http-equiv="Expires" content="0">
          <title>Conectar WhatsApp - Clínica Denticare</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
              font-family: 'Segoe UI', system-ui, sans-serif; 
              background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
            }
            .container {
              background: #ffffff;
              padding: 40px;
              border-radius: 20px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
              max-width: 500px;
              width: 100%;
            }
            .logo { font-size: 48px; margin-bottom: 10px; }
            h1 { 
              color: #1e3a5f; 
              font-size: 24px; 
              margin-bottom: 25px;
              font-weight: 600;
            }
            .qr-wrapper {
              background: #f8fafc;
              padding: 20px;
              border-radius: 16px;
              border: 3px solid #e2e8f0;
              display: inline-block;
              margin-bottom: 25px;
            }
            #qrcode {
              max-width: 280px;
              width: 100%;
              height: auto;
              display: block;
              border-radius: 8px;
            }
            .instructions {
              text-align: left;
              background: #f0f9ff;
              padding: 20px;
              border-radius: 12px;
              margin-bottom: 20px;
            }
            .instructions h3 {
              color: #0369a1;
              font-size: 16px;
              margin-bottom: 12px;
            }
            .instructions ol {
              color: #475569;
              font-size: 14px;
              line-height: 1.8;
              padding-left: 20px;
            }
            .instructions li { margin-bottom: 5px; }
            .refresh-btn {
              background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
              color: white;
              border: none;
              padding: 14px 32px;
              border-radius: 10px;
              font-size: 16px;
              font-weight: 600;
              cursor: pointer;
              transition: transform 0.2s, box-shadow 0.2s;
              display: inline-flex;
              align-items: center;
              gap: 8px;
            }
            .refresh-btn:hover {
              transform: translateY(-2px);
              box-shadow: 0 8px 20px rgba(37, 99, 235, 0.3);
            }
            .auto-refresh {
              margin-top: 15px;
              font-size: 12px;
              color: #94a3b8;
            }
            .countdown {
              font-weight: bold;
              color: #64748b;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">📱</div>
            <h1>Conectar WhatsApp - Clínica Denticare</h1>
            
            <div class="qr-wrapper">
              <img id="qrcode" src="${dataUri}" alt="QR Code WhatsApp" />
            </div>
            
            <div class="instructions">
              <h3>📋 Como conectar:</h3>
              <ol>
                <li>Abra o <strong>WhatsApp</strong> no celular da clínica</li>
                <li>Toque em <strong>⋮ Menu</strong> (3 pontos) no canto superior</li>
                <li>Selecione <strong>Aparelhos conectados</strong></li>
                <li>Toque em <strong>Conectar um aparelho</strong></li>
                <li>Aponte a câmera para este QR Code</li>
              </ol>
            </div>
            
            <button class="refresh-btn" onclick="location.reload()">
              🔄 Atualizar QR Code
            </button>
            
            <p class="auto-refresh">
              Atualização automática em <span class="countdown" id="countdown">30</span> segundos
            </p>
            
            <p class="debug-info" style="margin-top: 15px; font-size: 11px; color: #cbd5e1;">
              Status: ${result.status || 'unknown'} | Base64: ${qrBase64.length} chars
            </p>
          </div>
          
          <script>
            // Auto-reload every 30 seconds to prevent browser caching
            setTimeout(() => { 
              console.log('[QR Code] Recarregando página...');
              window.location.reload(); 
            }, 30000);
            
            // Countdown timer
            let seconds = 30;
            const countdownEl = document.getElementById('countdown');
            const countdownInterval = setInterval(() => {
              seconds--;
              if (seconds >= 0) {
                countdownEl.textContent = seconds;
              } else {
                clearInterval(countdownInterval);
              }
            }, 1000);
            
            // Verify image loaded
            const img = document.getElementById('qrcode');
            img.onerror = function() {
              console.error('[QR Code] Erro ao carregar imagem');
              this.alt = 'Erro ao carregar QR Code - Clique em Atualizar';
              this.style.background = '#fee2e2';
              this.style.padding = '40px';
            };
            img.onload = function() {
              console.log('[QR Code] Imagem carregada com sucesso!');
              console.log('[QR Code] Tamanho: ' + this.naturalWidth + 'x' + this.naturalHeight);
            };
          </script>
        </body>
        </html>
      `);

    } catch (error: any) {
      console.error("❌ [Evolution] Erro no setup:", error);
      res.status(500).send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <title>Setup WhatsApp - Erro</title>
        </head>
        <body>
          <h1>❌ Erro interno</h1>
          <p>${error.message}</p>
        </body>
        </html>
      `);
    }
  });

  // Admin route to auto-configure webhook on Evolution API
  // Usage: GET /admin/set-webhook?token=YOUR_ADMIN_SETUP_TOKEN
  app.get("/admin/set-webhook", async (req, res) => {
    const token = req.query.token as string;
    
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    if (!token || token !== ADMIN_SETUP_TOKEN) {
      console.warn("⚠️ [Set Webhook] Token inválido ou ausente");
      return res.status(403).json({ 
        success: false, 
        error: "Token inválido ou ausente",
        usage: "/admin/set-webhook?token=SEU_TOKEN"
      });
    }
    
    const EVO_URL = (process.env.EVO_URL || "").trim().replace(/\/+$/, "");
    const EVO_KEY = (process.env.EVO_KEY || "").trim();
    const EVO_INSTANCE = (process.env.EVO_INSTANCE || "denticare").trim();
    
    if (!EVO_URL || !EVO_KEY) {
      console.error("❌ [Set Webhook] EVO_URL ou EVO_KEY não configuradas");
      return res.status(503).json({ 
        success: false, 
        error: "Evolution API não configurada (EVO_URL ou EVO_KEY ausentes)"
      });
    }
    
    // PRIORIDADE 1: Usar WEBHOOK_GLOBAL_URL do Secret (se configurado)
    // PRIORIDADE 2: Fallback para headers do request
    const WEBHOOK_GLOBAL_URL = (process.env.WEBHOOK_GLOBAL_URL || "").trim().replace(/\/+$/, "");
    
    let webhookUrl: string;
    
    if (WEBHOOK_GLOBAL_URL) {
      // Usar o Secret configurado
      webhookUrl = WEBHOOK_GLOBAL_URL.endsWith("/webhook/evolution") 
        ? WEBHOOK_GLOBAL_URL 
        : `${WEBHOOK_GLOBAL_URL}/webhook/evolution`;
      console.log(`✅ [Set Webhook] Usando WEBHOOK_GLOBAL_URL do Secret`);
    } else {
      // Fallback: montar URL a partir dos headers
      const host = req.headers['x-forwarded-host'] || req.headers.host || '';
      if (host && !host.includes('localhost')) {
        webhookUrl = `https://${host}/webhook/evolution`;
        console.log(`⚠️ [Set Webhook] WEBHOOK_GLOBAL_URL não configurado. Usando headers: ${host}`);
      } else {
        console.error("❌ [Set Webhook] Não foi possível determinar a URL do webhook");
        return res.status(400).json({
          success: false,
          error: "Configure WEBHOOK_GLOBAL_URL nos Secrets ou acesse via URL pública do Replit"
        });
      }
    }
    
    // Garantir que a URL comece com https://
    if (!webhookUrl.startsWith("https://")) {
      webhookUrl = webhookUrl.replace(/^http:\/\//, "https://");
      if (!webhookUrl.startsWith("https://")) {
        webhookUrl = `https://${webhookUrl}`;
      }
    }
    
    console.log("\n========================================");
    console.log("🔧 [Set Webhook] Configurando webhook na Evolution API");
    console.log(`📍 [Set Webhook] EVO_URL: ${EVO_URL}`);
    console.log(`📛 [Set Webhook] Instância: ${EVO_INSTANCE}`);
    console.log(`🌐 [Set Webhook] Configurando Webhook na URL REAL: ${webhookUrl}`);
    console.log("========================================\n");
    
    try {
      const setWebhookUrl = `${EVO_URL}/webhook/set/${EVO_INSTANCE}`;
      
      const webhookConfig = {
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
          events: [
            "MESSAGES_UPSERT",
            "CONNECTION_UPDATE"
          ]
        }
      };
      
      console.log(`📤 [Set Webhook] POST ${setWebhookUrl}`);
      console.log(`📤 [Set Webhook] Body:`, JSON.stringify(webhookConfig, null, 2));
      
      const response = await axios.post(setWebhookUrl, webhookConfig, {
        headers: {
          "apikey": EVO_KEY,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      });
      
      console.log(`✅ [Set Webhook] Resposta:`, JSON.stringify(response.data, null, 2));
      
      return res.json({
        success: true,
        message: "Webhook configurado com sucesso!",
        webhookUrl: webhookUrl,
        instance: EVO_INSTANCE,
        evolutionResponse: response.data
      });
      
    } catch (error: any) {
      console.error(`❌ [Set Webhook] Erro ao configurar webhook:`, error.message);
      if (error.response?.data) {
        console.error(`   - Response data:`, JSON.stringify(error.response.data, null, 2));
      }
      
      return res.status(500).json({
        success: false,
        error: error.message,
        details: error.response?.data || null
      });
    }
  });

  // Dashboard de Atendimento
  app.get("/api/conversations", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const conversationsList = await storage.getWhatsappConversationsByClinic(req.user!.clinicId);
      res.json(conversationsList);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/conversations/:id/messages", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const conversation = await storage.getWhatsappConversationById(id);
      if (!conversation || conversation.clinicId !== req.user!.clinicId) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      const messagesList = await storage.getWhatsappMessagesByConversation(id);
      res.json({ conversation, messages: messagesList });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/conversations/:id/status", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const updated = await storage.updateWhatsappConversation(id, {
        status,
        assignedUserId: status === "human" ? req.user!.id : null,
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Send manual message (staff response) - WhatsApp endpoint
  app.post("/api/whatsapp/conversations/:id/send", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const messageText = req.body.message || req.body.text;

      if (!messageText || messageText.trim() === '') {
        return res.status(400).json({ message: "Mensagem é obrigatória" });
      }

      const conversation = await storage.getWhatsappConversationById(id);

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      if (conversation.clinicId !== req.user!.clinicId) {
        return res.status(403).json({ message: "Acesso negado. Faça login novamente." });
      }

      const savedMessage = await storage.createWhatsappMessage({
        conversationId: id,
        sender: 'staff',
        text: messageText.trim(),
      });

      console.log(`📤 Mensagem do atendente salva: ${savedMessage.id}`);

      if (isZApiConfigured()) {
        const sendResult = await sendWhatsAppMessage(conversation.phone, messageText.trim());
        if (!sendResult.success) {
          console.error("❌ Erro ao enviar via Z-API:", sendResult.error);
          return res.status(500).json({ 
            message: "Mensagem salva, mas falha ao enviar via WhatsApp",
            savedMessage 
          });
        }
      } else {
        console.warn("⚠️ Z-API não configurada - mensagem salva mas não enviada");
      }

      res.json(savedMessage);
    } catch (error: any) {
      console.error("Erro ao enviar mensagem:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Alias route for support panel - POST /api/conversations/:id/send
  app.post("/api/conversations/:id/send", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const messageText = req.body.message || req.body.text;

      if (!messageText || messageText.trim() === '') {
        return res.status(400).json({ message: "Mensagem é obrigatória" });
      }

      const conversation = await storage.getWhatsappConversationById(id);

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      if (conversation.clinicId !== req.user!.clinicId) {
        return res.status(403).json({ message: "Acesso negado. Faça login novamente." });
      }

      const savedMessage = await storage.createWhatsappMessage({
        conversationId: id,
        sender: 'staff',
        text: messageText.trim(),
      });

      console.log(`📤 Mensagem do atendente salva: ${savedMessage.id}`);

      if (isZApiConfigured()) {
        const sendResult = await sendWhatsAppMessage(conversation.phone, messageText.trim());
        if (!sendResult.success) {
          console.error("❌ Erro ao enviar via Z-API:", sendResult.error);
          return res.status(500).json({ 
            message: "Mensagem salva, mas falha ao enviar via WhatsApp",
            savedMessage 
          });
        }
      } else {
        console.warn("⚠️ Z-API não configurada - mensagem salva mas não enviada");
      }

      res.json(savedMessage);
    } catch (error: any) {
      console.error("Erro ao enviar mensagem:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}