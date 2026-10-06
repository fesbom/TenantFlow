import type { Express, Response } from "express";
import { randomUUID } from "crypto";
import { storage } from "../storage";
import { authenticateToken, requireRole, type AuthenticatedRequest } from "../middleware/auth";

interface SimulatorDeps {
  // Executa o mesmo pipeline do webhook da Evolution API, marcando o fluxo como simulado.
  processSimulatedInbound: (payload: unknown) => Promise<void>;
}

interface ResolvedContact {
  ref: string;
  type: "patient" | "custom";
  name: string | null;
  phone: string;
  patientId: string | null;
}

const MAX_MESSAGE_LENGTH = 4000;
const superadminOnly = [authenticateToken, requireRole(["superadmin"])] as const;
const clinicAdminOnly = [authenticateToken, requireRole(["admin"])] as const;

const onlyDigits = (value: string) => value.replace(/\D/g, "");
const isValidPhone = (digits: string) => digits.length >= 10 && digits.length <= 15;

function sendError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ code, message });
}

async function describeSimulation(clinicId: string) {
  const clinic = await storage.getClinicById(clinicId);
  if (!clinic) return null;
  let updatedByName: string | null = null;
  if (clinic.simulationUpdatedBy) {
    updatedByName = (await storage.getUserById(clinic.simulationUpdatedBy))?.fullName ?? null;
  }
  return {
    clinicId: clinic.id,
    clinicName: clinic.name,
    simulationMode: clinic.simulationMode,
    updatedAt: clinic.simulationUpdatedAt,
    updatedByName,
  };
}

async function resolveContact(clinicId: string, ref: string): Promise<ResolvedContact | null> {
  const [kind, id] = ref.split(":");
  if (!id) return null;

  if (kind === "patient") {
    const patient = await storage.getPatientById(id, clinicId);
    const phone = patient ? onlyDigits(patient.phone ?? "") : "";
    if (!patient || !phone) return null;
    return { ref, type: "patient", name: patient.fullName, phone, patientId: patient.id };
  }

  if (kind === "contact") {
    const contact = await storage.getSimulationContactById(id, clinicId);
    if (!contact) return null;
    if (contact.patientId) {
      const patient = await storage.getPatientById(contact.patientId, clinicId);
      const patientPhone = patient ? onlyDigits(patient.phone ?? "") : "";
      if (patient && patientPhone) {
        return { ref, type: "patient", name: patient.fullName, phone: patientPhone, patientId: patient.id };
      }
    }
    return { ref, type: "custom", name: contact.name, phone: contact.phone, patientId: null };
  }

  return null;
}

// Dentistas da clínica que possuem número de WhatsApp (instância) vinculado.
async function listSimulatorDentists(clinicId: string) {
  const [users, instances] = await Promise.all([
    storage.getUsersByClinic(clinicId),
    storage.getWhatsappInstancesWithDentists(clinicId),
  ]);
  const dentists = users.filter((user) => user.role === "dentist" && user.isActive);

  return dentists.flatMap((dentist) => {
    const instance = instances.find((item) => item.dentistIds.includes(dentist.id));
    if (!instance) return [];
    return [{
      id: dentist.id,
      fullName: dentist.fullName,
      instanceId: instance.id,
      instanceName: instance.instanceName,
      instanceLabel: instance.label,
      whatsappPhone: instance.connectedPhone && /^\d+$/.test(instance.connectedPhone) ? instance.connectedPhone : null,
    }];
  });
}

async function findConversation(clinicId: string, contact: ResolvedContact, instanceName: string) {
  return storage.getWhatsappConversationByPhone(clinicId, contact.phone, instanceName);
}

function serializeMessage(message: Awaited<ReturnType<typeof storage.getWhatsappMessagesByConversation>>[number]) {
  return {
    id: message.id,
    sender: message.sender,
    direction: message.direction,
    text: message.text,
    isSimulated: message.isSimulated,
    createdAt: message.createdAt,
  };
}

export function registerSimulatorRoutes(app: Express, deps: SimulatorDeps) {
  const base = "/api/admin/clinics/:clinicId/simulator";

  // ── Modo Simulação: consulta/alternância (superadmin) ─────────────────────
  app.get(`${base}/status`, ...superadminOnly, async (req, res) => {
    try {
      const status = await describeSimulation(req.params.clinicId);
      if (!status) return sendError(res, 404, "CLINICA_NAO_ENCONTRADA", "Clínica não encontrada.");
      res.json(status);
    } catch (error: any) {
      console.error("[SIMULADOR] status:", error.message);
      sendError(res, 500, "ERRO_INTERNO", "Erro ao consultar o Modo Simulação.");
    }
  });

  app.put(`${base}/mode`, ...superadminOnly, async (req: AuthenticatedRequest, res) => {
    try {
      if (typeof req.body?.enabled !== "boolean") {
        return sendError(res, 400, "DADOS_INVALIDOS", "O campo 'enabled' deve ser booleano.");
      }
      const updated = await storage.setClinicSimulationMode(req.params.clinicId, req.body.enabled, req.user!.id);
      if (!updated) return sendError(res, 404, "CLINICA_NAO_ENCONTRADA", "Clínica não encontrada.");
      console.log(`[SIMULADOR] Modo Simulação ${req.body.enabled ? "ATIVADO" : "DESATIVADO"} na clínica ${updated.id} por ${req.user!.email}`);
      res.json(await describeSimulation(updated.id));
    } catch (error: any) {
      console.error("[SIMULADOR] mode:", error.message);
      sendError(res, 500, "ERRO_INTERNO", "Erro ao alterar o Modo Simulação.");
    }
  });

  // ── Contatos externos simuláveis ──────────────────────────────────────────
  app.get(`${base}/contacts`, ...superadminOnly, async (req, res) => {
    try {
      const clinicId = req.params.clinicId;
      const [contacts, patients] = await Promise.all([
        storage.getSimulationContactsByClinic(clinicId),
        storage.getPatientsByClinic(clinicId),
      ]);
      const patientsById = new Map(patients.map((patient) => [patient.id, patient]));
      const result: ResolvedContact[] = [];
      const seenPatients = new Set<string>();

      for (const contact of contacts) {
        const patient = contact.patientId ? patientsById.get(contact.patientId) : undefined;
        const patientPhone = patient ? onlyDigits(patient.phone ?? "") : "";
        if (patient && patientPhone) seenPatients.add(patient.id);
        result.push({
          ref: `contact:${contact.id}`,
          type: patient && patientPhone ? "patient" : "custom",
          name: patient && patientPhone ? patient.fullName : contact.name,
          phone: patient && patientPhone ? patientPhone : contact.phone,
          patientId: patient && patientPhone ? patient.id : null,
        });
      }

      for (const patient of patients) {
        const phone = onlyDigits(patient.phone ?? "");
        if (!phone || seenPatients.has(patient.id)) continue;
        result.push({ ref: `patient:${patient.id}`, type: "patient", name: patient.fullName, phone, patientId: patient.id });
      }

      result.sort((a, b) => (a.name ?? a.phone).localeCompare(b.name ?? b.phone, "pt-BR"));
      res.json(result);
    } catch (error: any) {
      console.error("[SIMULADOR] contacts:", error.message);
      sendError(res, 500, "ERRO_INTERNO", "Erro ao listar contatos.");
    }
  });

  app.post(`${base}/contacts`, ...superadminOnly, async (req: AuthenticatedRequest, res) => {
    try {
      const clinicId = req.params.clinicId;
      if (!(await storage.getClinicById(clinicId))) {
        return sendError(res, 404, "CLINICA_NAO_ENCONTRADA", "Clínica não encontrada.");
      }

      const patientId = typeof req.body?.patientId === "string" ? req.body.patientId : "";
      let name: string | null = null;
      let phone = "";
      let linkedPatientId: string | null = null;

      if (patientId) {
        const patient = await storage.getPatientById(patientId, clinicId);
        if (!patient) return sendError(res, 404, "PACIENTE_NAO_ENCONTRADO", "Paciente não encontrado nesta clínica.");
        phone = onlyDigits(patient.phone ?? "");
        name = patient.fullName;
        linkedPatientId = patient.id;
      } else {
        phone = onlyDigits(typeof req.body?.phone === "string" ? req.body.phone : "");
        const rawName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
        name = rawName ? rawName.slice(0, 120) : null;
      }

      if (!isValidPhone(phone)) {
        return sendError(res, 400, "TELEFONE_INVALIDO", "Informe um telefone válido com DDD (e DDI, se aplicável).");
      }

      const existing = await storage.getSimulationContactByPhone(clinicId, phone);
      if (existing) {
        return res.json({
          ref: `contact:${existing.id}`,
          type: existing.patientId ? "patient" : "custom",
          name: existing.name ?? name,
          phone,
          patientId: existing.patientId,
          alreadyExisted: true,
        });
      }

      const created = await storage.createSimulationContact({
        clinicId,
        patientId: linkedPatientId,
        name,
        phone,
        createdBy: req.user!.id,
      });
      res.status(201).json({
        ref: `contact:${created.id}`,
        type: linkedPatientId ? "patient" : "custom",
        name,
        phone,
        patientId: linkedPatientId,
        alreadyExisted: false,
      });
    } catch (error: any) {
      console.error("[SIMULADOR] create contact:", error.message);
      sendError(res, 500, "ERRO_INTERNO", "Erro ao criar contato.");
    }
  });

  // ── Dentistas (painel esquerdo) com resumo da conversa do contato ─────────
  app.get(`${base}/contacts/:contactRef/dentists`, ...superadminOnly, async (req, res) => {
    try {
      const clinicId = req.params.clinicId;
      const contact = await resolveContact(clinicId, req.params.contactRef);
      if (!contact) return sendError(res, 404, "CONTATO_NAO_ENCONTRADO", "Contato não encontrado.");

      const dentists = await listSimulatorDentists(clinicId);
      const result = await Promise.all(dentists.map(async (dentist) => {
        const conversation = await findConversation(clinicId, contact, dentist.instanceName);
        const messages = conversation ? await storage.getWhatsappMessagesByConversation(conversation.id) : [];
        const last = messages[messages.length - 1];
        return {
          ...dentist,
          lastMessage: last
            ? { text: last.text, direction: last.direction, isSimulated: last.isSimulated, createdAt: last.createdAt }
            : null,
        };
      }));

      result.sort((a, b) => {
        const left = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const right = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
        return right - left || a.fullName.localeCompare(b.fullName, "pt-BR");
      });
      res.json({ contact, dentists: result });
    } catch (error: any) {
      console.error("[SIMULADOR] dentists:", error.message);
      sendError(res, 500, "ERRO_INTERNO", "Erro ao listar dentistas.");
    }
  });

  // ── Histórico da conversa (contato simulado × dentista) ───────────────────
  app.get(`${base}/contacts/:contactRef/dentists/:dentistId/messages`, ...superadminOnly, async (req, res) => {
    try {
      const clinicId = req.params.clinicId;
      const contact = await resolveContact(clinicId, req.params.contactRef);
      if (!contact) return sendError(res, 404, "CONTATO_NAO_ENCONTRADO", "Contato não encontrado.");
      const dentist = (await listSimulatorDentists(clinicId)).find((item) => item.id === req.params.dentistId);
      if (!dentist) return sendError(res, 404, "DENTISTA_NAO_ENCONTRADO", "Dentista não encontrado ou sem WhatsApp vinculado.");

      const conversation = await findConversation(clinicId, contact, dentist.instanceName);
      const messages = conversation ? await storage.getWhatsappMessagesByConversation(conversation.id) : [];
      res.json({
        dentist,
        contact,
        conversationStatus: conversation?.status ?? null,
        messages: messages.map(serializeMessage),
      });
    } catch (error: any) {
      console.error("[SIMULADOR] messages:", error.message);
      sendError(res, 500, "ERRO_INTERNO", "Erro ao buscar mensagens.");
    }
  });

  // ── Envio em nome do contato simulado ─────────────────────────────────────
  app.post(`${base}/contacts/:contactRef/dentists/:dentistId/messages`, ...superadminOnly, async (req, res) => {
    try {
      const clinicId = req.params.clinicId;
      const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
      if (!text) return sendError(res, 400, "MENSAGEM_VAZIA", "Digite uma mensagem.");
      if (text.length > MAX_MESSAGE_LENGTH) {
        return sendError(res, 400, "MENSAGEM_LONGA", `A mensagem excede ${MAX_MESSAGE_LENGTH} caracteres.`);
      }

      const clinic = await storage.getClinicById(clinicId);
      if (!clinic) return sendError(res, 404, "CLINICA_NAO_ENCONTRADA", "Clínica não encontrada.");
      if (!clinic.simulationMode) {
        return sendError(res, 409, "SIMULACAO_INATIVA", "O Modo Simulação está desativado para esta clínica.");
      }

      const contact = await resolveContact(clinicId, req.params.contactRef);
      if (!contact) return sendError(res, 404, "CONTATO_NAO_ENCONTRADO", "Contato não encontrado.");
      const dentist = (await listSimulatorDentists(clinicId)).find((item) => item.id === req.params.dentistId);
      if (!dentist) return sendError(res, 404, "DENTISTA_NAO_ENCONTRADO", "Dentista não encontrado ou sem WhatsApp vinculado.");

      // Payload no mesmo formato do evento `messages.upsert` da Evolution API.
      await deps.processSimulatedInbound({
        event: "messages.upsert",
        instance: dentist.instanceName,
        data: {
          key: { remoteJid: `${contact.phone}@s.whatsapp.net`, fromMe: false, id: `sim-in-${randomUUID()}` },
          pushName: contact.name ?? contact.phone,
          message: { conversation: text },
          messageTimestamp: Math.floor(Date.now() / 1000),
        },
      });

      const conversation = await findConversation(clinicId, contact, dentist.instanceName);
      const messages = conversation ? await storage.getWhatsappMessagesByConversation(conversation.id) : [];
      res.status(201).json({ conversationStatus: conversation?.status ?? null, messages: messages.map(serializeMessage) });
    } catch (error: any) {
      console.error("[SIMULADOR] send:", error.message);
      sendError(res, 500, "ERRO_INTERNO", "Erro ao enviar a mensagem simulada.");
    }
  });

  // ── Visão do administrador da clínica ─────────────────────────────────────
  app.get("/api/whatsapp/simulation", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user!.clinicId) return sendError(res, 403, "CLINICA_AUSENTE", "Usuário sem clínica vinculada.");
      const status = await describeSimulation(req.user!.clinicId);
      if (!status) return sendError(res, 404, "CLINICA_NAO_ENCONTRADA", "Clínica não encontrada.");
      res.json(status);
    } catch (error: any) {
      console.error("[SIMULADOR] clinic status:", error.message);
      sendError(res, 500, "ERRO_INTERNO", "Erro ao consultar o Modo Simulação.");
    }
  });

  // O administrador da clínica só pode DESATIVAR; a ativação é feita pelo superadmin.
  app.delete("/api/whatsapp/simulation", ...clinicAdminOnly, async (req: AuthenticatedRequest, res) => {
    try {
      const updated = await storage.setClinicSimulationMode(req.user!.clinicId, false, req.user!.id);
      if (!updated) return sendError(res, 404, "CLINICA_NAO_ENCONTRADA", "Clínica não encontrada.");
      console.log(`[SIMULADOR] Modo Simulação DESATIVADO pelo administrador da clínica ${updated.id} (${req.user!.email})`);
      res.json(await describeSimulation(updated.id));
    } catch (error: any) {
      console.error("[SIMULADOR] clinic disable:", error.message);
      sendError(res, 500, "ERRO_INTERNO", "Erro ao desativar o Modo Simulação.");
    }
  });
}
