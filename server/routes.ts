import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import express from "express";
import path from "path";
import { storage } from "./storage";
import { authenticateToken, requireRole, generateToken, type AuthenticatedRequest } from "./middleware/auth";
import { upload } from "./middleware/upload";
import { sendEmail, generatePasswordResetEmail } from "./email";
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
      const today = new Date();
      const patients = await storage.getBirthdayPatients(req.user!.clinicId, today);
      res.json(patients);
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
    } catch (error) {
      console.error("Create user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Patient routes
  app.get("/api/patients", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const patients = await storage.getPatientsByClinic(req.user!.clinicId);
      res.json(patients);
    } catch (error) {
      console.error("Get patients error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/patients", authenticateToken, requireRole(["admin", "secretary"]), async (req: AuthenticatedRequest, res) => {
    try {
      const patientData = insertPatientSchema.parse({
        ...req.body,
        clinicId: req.user!.clinicId,
      });

      const patient = await storage.createPatient(patientData);
      res.status(201).json(patient);
    } catch (error) {
      console.error("Create patient error:", error);
      res.status(500).json({ message: "Internal server error" });
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

  app.put("/api/patients/:id", authenticateToken, requireRole(["admin", "secretary"]), async (req: AuthenticatedRequest, res) => {
    try {
      const updateData = insertPatientSchema.partial().parse(req.body);
      const patient = await storage.updatePatient(req.params.id, updateData, req.user!.clinicId);
      
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }
      
      res.json(patient);
    } catch (error) {
      console.error("Update patient error:", error);
      res.status(500).json({ message: "Internal server error" });
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
      const appointmentData = insertAppointmentSchema.parse({
        ...req.body,
        clinicId: req.user!.clinicId,
      });

      const appointment = await storage.createAppointment(appointmentData);
      res.status(201).json(appointment);
    } catch (error) {
      console.error("Create appointment error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/appointments/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const updateData = insertAppointmentSchema.partial().parse(req.body);
      const appointment = await storage.updateAppointment(req.params.id, updateData, req.user!.clinicId);
      
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      
      res.json(appointment);
    } catch (error) {
      console.error("Update appointment error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/appointments/:id", authenticateToken, requireRole(["admin", "secretary"]), async (req: AuthenticatedRequest, res) => {
    try {
      const deleted = await storage.deleteAppointment(req.params.id, req.user!.clinicId);
      if (!deleted) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Delete appointment error:", error);
      res.status(500).json({ message: "Internal server error" });
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
      const { responses } = req.body; // Array of { questionId, response, patientId, appointmentId }
      
      const savedResponses = [];
      for (const responseData of responses) {
        const response = await storage.createAnamnesisResponse(responseData);
        savedResponses.push(response);
      }

      res.status(201).json(savedResponses);
    } catch (error) {
      console.error("Create anamnesis responses error:", error);
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
      console.log("Received treatment data:", req.body);
      const result = insertTreatmentSchema.safeParse(req.body);
      if (!result.success) {
        console.log("Validation errors:", result.error.errors);
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

  const httpServer = createServer(app);
  return httpServer;
}
